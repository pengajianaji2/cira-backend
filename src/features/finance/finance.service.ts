import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { getBusinessDateWib, isInvoiceOverdue } from "../../shared/utils/businessDate.js";
import { filePath } from "../files/fileSecurity.js";
import { financeRepository } from "./finance.repository.js";
import { validateSingleTriggerFields } from "./finance.schema.js";
import {
  CreateContractDto,
  CreatePaymentDto,
  FinanceSummary,
  IssueInvoiceDto,
  TermInputDto,
  TermTriggerType,
  UpdatePaymentDto,
  UpdateTermDto,
  UploadBastDto,
  VerifyPaymentDto,
} from "./finance.types.js";
import { z } from "zod";

const presentPayment = (payment: any) => ({
  ...payment,
  ...(payment.amount !== undefined ? { amount: Number(payment.amount) } : {}),
  proofUrl: filePath(payment.proofFileId),
  proofMimeType: payment.proof?.mimeType ?? null,
});

const presentTerm = (term: any, now: Date = new Date()) => ({
  ...term,
  percentage: term.percentage !== undefined ? Number(term.percentage) : term.percentage,
  amount: Number(term.amount),
  overdue: isInvoiceOverdue(term, now),
  bastUrl: filePath(term.bastFileId),
  invoicePdfUrl: filePath(term.invoiceFileId),
  bastMimeType: term.bast?.mimeType ?? null,
});

function normalizeTriggerFields(input: {
  triggerType: TermTriggerType;
  triggerDate?: string | null;
  requiredCompletedSprints?: number | null;
}) {
  switch (input.triggerType) {
    case "date":
      return {
        triggerType: "date" as const,
        triggerDate: input.triggerDate ?? null,
        requiredCompletedSprints: null,
        triggerSprintId: null,
        dueDate: null,
      };
    case "sprint":
      return {
        triggerType: "sprint" as const,
        triggerDate: null,
        requiredCompletedSprints: input.requiredCompletedSprints ?? null,
        triggerSprintId: null,
        dueDate: null,
      };
    case "manual":
      return {
        triggerType: "manual" as const,
        triggerDate: null,
        requiredCompletedSprints: null,
        triggerSprintId: null,
        dueDate: null,
      };
    default: {
      const _exhaustive: never = input.triggerType;
      return _exhaustive;
    }
  }
}

/** Service domain kontrak termin berbobot 100%, evaluator kesiapan otomatis WIB, penerbitan invoice manual, dan manajemen pembayaran proyek. */
export const financeService = {
  /**
   * Membuat atau memperbarui kontrak proyek dengan termin berbobot total tepat 100%.
   * Termin terakhir otomatis menyerap selisih pembulatan rupiah.
   * Setiap termin wajib memiliki tepat satu pemicu valid (date | sprint | manual).
   */
  async createContract(
    projectId: string,
    dto: CreateContractDto,
    user?: AuthUserPayload,
    now: Date = new Date()
  ) {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    // 1. Validasi total persentase tepat 100%
    const totalPercentage = dto.terms.reduce((sum, t) => sum + t.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.001) {
      throw new BadRequestError(
        `Total persentase seluruh termin wajib tepat 100%. Akumulasi saat ini: ${totalPercentage}%.`
      );
    }

    // 2. Proteksi penguncian termin
    const projectWithTerms = await financeRepository.findProjectWithTerms(projectId);
    const hasLockedTerm = projectWithTerms?.paymentTerms.some(
      (t) => t.isLocked || t.status === "invoiced" || t.status === "paid"
    );
    if (hasLockedTerm) {
      throw new ConflictError(
        "Konfigurasi kontrak tidak dapat diubah karena terdapat termin yang telah diterbitkan invoice atau terkunci."
      );
    }

    // 3. Kalkulasi nominal rupiah per termin & penyerapan pembulatan pada termin terakhir
    let allocatedAmount = 0;
    const processedTerms = dto.terms.map((term: TermInputDto, index: number) => {
      const isLast = index === dto.terms.length - 1;
      let amount = 0;

      if (isLast) {
        amount = Math.round((dto.contractValue - allocatedAmount) * 100) / 100;
      } else {
        amount = Math.round(dto.contractValue * (term.percentage / 100) * 100) / 100;
        allocatedAmount += amount;
      }

      const normalizedTrigger = normalizeTriggerFields({
        triggerType: term.triggerType || "manual",
        triggerDate: term.triggerDate,
        requiredCompletedSprints: term.requiredCompletedSprints,
      });

      return {
        termNumber: index + 1,
        title: term.title,
        percentage: term.percentage,
        amount,
        ...normalizedTrigger,
        notes: term.notes ?? null,
      };
    });

    await financeRepository.saveContractWithTerms(projectId, dto.contractValue, processedTerms);

    // Evaluasi kesiapan otomatis jika pemicu tanggal/sprint sudah terpenuhi saat dibuat
    await financeRepository.evaluateProjectTermReadiness(projectId, now, {
      id: user?.id,
      name: user?.name,
      role: user?.roles?.[0],
    });

    const refreshedTerms = await financeRepository.findTermsByProjectId(projectId);

    await financeRepository.logActivity({
      projectId,
      category: "finance",
      action: "CONTRACT_CREATE",
      description: `Kontrak proyek dibuat dengan nilai Rp ${dto.contractValue.toLocaleString(
        "id-ID"
      )} dan ${refreshedTerms.length} termin pembayaran berbobot 100%.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        contractValue: dto.contractValue,
        termsCount: refreshedTerms.length,
      },
    });

    return {
      contractValue: dto.contractValue,
      terms: refreshedTerms.map((t) => presentTerm(t, now)),
    };
  },

  /**
   * AC-3.2 (BR-TERM-03, BR-TERM-04, BR-TERM-06):
   * Evaluator idempotent untuk termin planned berbasis date atau sprint.
   */
  async evaluateProjectTerms(
    projectId: string,
    now: Date = new Date(),
    user?: AuthUserPayload
  ) {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const transitionedTermIds = await financeRepository.evaluateProjectTermReadiness(
      projectId,
      now,
      {
        id: user?.id,
        name: user?.name,
        role: user?.roles?.[0],
      }
    );

    const terms = await financeRepository.findTermsByProjectId(projectId);
    return {
      transitionedTermIds,
      terms: terms.map((t) => presentTerm(t, now)),
    };
  },

  /**
   * Mengambil seluruh termin proyek terurut setelah mengevaluasi pemicu tanggal/sprint secara idempotent di WIB.
   *
   * @param projectId - ID proyek target.
   * @param now - Referensi waktu saat ini (default `new Date()`).
   * @throws {NotFoundError} Bila proyek tidak ditemukan.
   */
  async getProjectTerms(projectId: string, now: Date = new Date()) {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    // Evaluasi idempotent pemicu tanggal/sprint yang mungkin sudah jatuh temponya hari ini (WIB)
    await financeRepository.evaluateProjectTermReadiness(projectId, now);

    return (await financeRepository.findTermsByProjectId(projectId)).map((t) =>
      presentTerm(t, now)
    );
  },

  /**
   * Mengambil detail satu termin pembayaran (`PaymentTerm`) sekaligus mengevaluasi pemicunya bila masih `planned`.
   *
   * @param id - ID termin pembayaran.
   * @param now - Referensi waktu evaluasi WIB (default `new Date()`).
   * @throws {NotFoundError} Bila termin tidak ditemukan.
   */
  async getTermById(id: string, now: Date = new Date()) {
    const existing = await financeRepository.findTermById(id);
    if (!existing) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (existing.status === "planned") {
      await financeRepository.evaluateProjectTermReadiness(existing.projectId, now);
      const refreshed = await financeRepository.findTermById(id);
      if (refreshed) {
        return presentTerm(refreshed, now);
      }
    }

    return presentTerm(existing, now);
  },

  /**
   * AC-3.1 & BR-TERM-08: Pembaruan satu termin yang belum terkunci (judul, catatan, pemicu tunggal).
   * Progresi status umum tidak dapat dimundurkan.
   */
  async updateTerm(
    id: string,
    dto: UpdateTermDto,
    user?: AuthUserPayload,
    now: Date = new Date()
  ) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.isLocked || term.status === "invoiced" || term.status === "paid") {
      throw new ConflictError(
        `Termin "${term.title}" telah memiliki invoice atau lunas sehingga tidak dapat diubah.`
      );
    }

    const nextTriggerType = (dto.triggerType ?? term.triggerType) as TermTriggerType;
    const isChangingTrigger =
      dto.triggerType !== undefined ||
      dto.triggerDate !== undefined ||
      dto.requiredCompletedSprints !== undefined;

    if (isChangingTrigger && term.status !== "planned") {
      throw new ConflictError(
        `Pemicu termin "${term.title}" tidak dapat diubah setelah berstatus '${term.status}'.`
      );
    }

    const candidateTrigger = {
      triggerType: nextTriggerType,
      triggerDate:
        dto.triggerDate !== undefined
          ? dto.triggerDate
          : nextTriggerType === "date"
          ? term.triggerDate
          : null,
      requiredCompletedSprints:
        dto.requiredCompletedSprints !== undefined
          ? dto.requiredCompletedSprints
          : nextTriggerType === "sprint"
          ? term.requiredCompletedSprints
          : null,
    };

    // Validasi invariant domain exhaustive pada state gabungan
    const triggerCheckSchema = z
      .object({
        triggerType: z.enum(["date", "sprint", "manual"]),
        triggerDate: z.string().nullable().optional(),
        requiredCompletedSprints: z.number().int().positive().nullable().optional(),
      })
      .superRefine((val, ctx) => validateSingleTriggerFields(val, ctx));

    const check = triggerCheckSchema.safeParse(candidateTrigger);
    if (!check.success) {
      throw new BadRequestError(
        check.error.issues.map((i) => i.message).join(" "),
        check.error.issues
      );
    }

    const normalizedTrigger = normalizeTriggerFields(candidateTrigger);

    await financeRepository.updateTerm(id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(isChangingTrigger ? normalizedTrigger : {}),
    });

    await financeRepository.evaluateProjectTermReadiness(term.projectId, now, {
      id: user?.id,
      name: user?.name,
      role: user?.roles?.[0],
    });

    const refreshed = await financeRepository.findTermById(id);

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "TERM_UPDATE",
      description: `Konfigurasi termin #${term.termNumber} "${refreshed?.title || term.title}" diperbarui.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        termId: id,
        changes: dto,
      },
    });

    return presentTerm(refreshed, now);
  },

  /**
   * BR-TERM-05 & BR-TERM-06: Tandai termin siap ditagih ('ready') oleh pengguna berizin
   * (dengan atau tanpa lampiran BAST). Idempotent: tidak menggeser readyAt bila sudah ready.
   */
  async markTermReadyWithBast(
    id: string,
    dto: UploadBastDto = {},
    user?: AuthUserPayload,
    now: Date = new Date()
  ) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.status === "invoiced" || term.status === "paid" || term.isLocked) {
      throw new ConflictError(
        `Termin "${term.title}" sudah berstatus '${term.status}' dan terkunci.`
      );
    }

    // Jika termin sudah berstatus 'ready', pertahankan readyAt (idempotent).
    if (term.status === "ready") {
      if (dto.notes === undefined) return presentTerm(term, now);
      const updatedExisting = await financeRepository.updateTerm(id, {
        notes: dto.notes ? `${term.notes || ""}\n${dto.notes}`.trim() : term.notes,
      });
      return presentTerm(updatedExisting, now);
    }

    // Validasi prasyarat pemicu jika termin masih 'planned' dan bukan pemicu 'manual'
    if (term.triggerType === "sprint") {
      if (term.requiredCompletedSprints) {
        const completedSprints = await financeRepository.countCompletedSprints(term.projectId);
        if (completedSprints < term.requiredCompletedSprints) {
          throw new BadRequestError(
            `Termin "${term.title}" membutuhkan ${term.requiredCompletedSprints} sprint selesai (saat ini baru ${completedSprints} selesai).`
          );
        }
      } else if (term.triggerSprintId) {
        const sprint = await financeRepository.findSprintById(term.triggerSprintId);
        if (!sprint || sprint.status !== "completed") {
          throw new BadRequestError(
            `Sprint trigger "${sprint?.name || term.triggerSprintId}" belum diselesaikan. Selesaikan sprint terkait terlebih dahulu sebelum menandai termin siap ditagih.`
          );
        }
      }
    } else if (term.triggerType === "date" && term.triggerDate) {
      const todayWib = getBusinessDateWib(now);
      if (todayWib < term.triggerDate) {
        throw new BadRequestError(
          `Tanggal pemicu termin (${term.triggerDate} WIB) belum tercapai (hari ini WIB: ${todayWib}).`
        );
      }
    }

    const updated = await financeRepository.markTermReadyAtomically(id, {
      readyAt: term.readyAt ?? now,
      ...(dto.notes !== undefined
        ? { notes: dto.notes ? `${term.notes || ""}\n${dto.notes}`.trim() : term.notes }
        : {}),
    });

    if (!updated) {
      const current = await financeRepository.findTermById(id);
      return presentTerm(current, now);
    }

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "TERM_READY",
      description: `Termin "${term.title}" ditandai Siap ditagih oleh ${user?.name || "Pengguna berizin"}.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        termId: id,
        title: term.title,
        status: "ready",
        readyAt: updated.readyAt,
      },
    });

    return presentTerm(updated, now);
  },

  /**
   * AC-3.3 & BR-TERM-07: Penerbitan/pencatatan invoice manusiawi dari termin berstatus 'ready'.
   * Wajib menyertakan invoiceDueDate (YYYY-MM-DD) terpisah dari triggerDate.
   */
  async issueTermInvoice(
    id: string,
    dto: IssueInvoiceDto,
    user?: AuthUserPayload,
    now: Date = new Date()
  ) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.isLocked || term.invoiceNumber || term.status === "invoiced" || term.status === "paid") {
      throw new ConflictError(
        `Invoice untuk termin "${term.title}" sudah pernah diterbitkan${
          term.invoiceNumber ? ` dengan nomor ${term.invoiceNumber}` : ""
        }.`
      );
    }

    if (term.status !== "ready") {
      throw new BadRequestError(
        `Termin "${term.title}" belum berstatus 'Siap ditagih' (ready). Pastikan pemicu terpenuhi atau tandai siap ditagih terlebih dahulu.`
      );
    }

    if (!dto.invoiceDueDate) {
      throw new BadRequestError("Tanggal jatuh tempo invoice (invoiceDueDate) wajib diisi.");
    }

    const year = Number(getBusinessDateWib(now).slice(0, 4));
    const issued = await financeRepository.issueInvoiceAtomically(id, year, term.termNumber, {
      invoiceNumber: dto.invoiceNumber,
      invoiceDueDate: dto.invoiceDueDate,
      invoiceIssuedAt: now,
      status: "invoiced",
      isLocked: true,
      invoiceFileId: term.invoiceFileId,
      notes: dto.notes ? `${term.notes || ""}\n${dto.notes}`.trim() : term.notes,
    });

    if (!issued?.updated) {
      throw new ConflictError("Invoice telah diterbitkan oleh proses lain. Muat ulang data termin.");
    }
    const { invoiceNumber, updated } = issued;

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "INVOICE_ISSUE",
      description: `Invoice resmi ${invoiceNumber} diterbitkan untuk "${term.title}" sebesar Rp ${Number(
        term.amount
      ).toLocaleString("id-ID")} (jatuh tempo ${dto.invoiceDueDate}). Termin terkunci dari perubahan.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        termId: id,
        invoiceNumber,
        invoiceDueDate: dto.invoiceDueDate,
        amount: Number(term.amount),
        status: "invoiced",
        isLocked: true,
      },
    });

    return presentTerm(updated, now);
  },

  /**
   * AC-3.4 & BR-TERM-08: Menandai termin berstatus 'invoiced' menjadi 'paid' (Lunas).
   */
  async markTermPaid(id: string, user?: AuthUserPayload, now: Date = new Date()) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.status === "paid") {
      throw new ConflictError(`Termin "${term.title}" sudah berstatus Lunas (paid).`);
    }

    if (term.status !== "invoiced") {
      throw new BadRequestError(
        `Termin "${term.title}" harus berstatus 'invoiced' sebelum dapat ditandai Lunas.`
      );
    }

    const updated = await financeRepository.markTermPaidAtomically(id, now);
    if (!updated) {
      throw new ConflictError("Status pelunasan termin telah berubah. Muat ulang data.");
    }

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "TERM_PAID",
      description: `Invoice ${term.invoiceNumber || term.title} ditandai Lunas (paid) oleh ${
        user?.name || "Pengguna berizin"
      }.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        termId: id,
        invoiceNumber: term.invoiceNumber,
        paidAt: now.toISOString(),
        amount: Number(term.amount),
      },
    });

    return presentTerm(updated, now);
  },

  /**
   * Menghapus termin pembayaran yang belum terkunci dan belum memiliki invoice resmi.
   *
   * @throws {NotFoundError} Bila termin tidak ditemukan.
   * @throws {ConflictError} Bila termin berstatus `invoiced`, `paid`, atau `isLocked = true`.
   */
  async deleteTerm(id: string, user?: AuthUserPayload) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.isLocked || term.status === "invoiced" || term.status === "paid") {
      throw new ConflictError(
        "Termin yang telah memiliki invoice resmi atau berstatus terkunci tidak dapat dihapus."
      );
    }

    await financeRepository.deleteTerm(id);

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "TERM_DELETE",
      description: `Termin "${term.title}" dihapus.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: { termId: id, title: term.title },
    });

    return { success: true };
  },

  // =========================================================================
  // Existing Payment Methods (Backward Compatibility)
  // =========================================================================

  async getPaymentsByProjectId(projectId: string) {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    return (await financeRepository.findByProjectId(projectId)).map(presentPayment);
  },

  async createPayment(projectId: string, dto: CreatePaymentDto, user?: AuthUserPayload) {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const payment = await financeRepository.create(projectId, dto);

    await financeRepository.logActivity({
      projectId,
      category: "finance",
      action: "CREATE",
      description: `Termin pembayaran "${payment.title}" sebesar Rp ${Number(payment.amount).toLocaleString(
        "id-ID"
      )} berhasil ditambahkan.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: payment.id,
        title: payment.title,
        amount: Number(payment.amount),
        status: payment.status,
      },
    });

    return presentPayment(payment);
  },

  async verifyPayment(id: string, dto: VerifyPaymentDto, user?: AuthUserPayload) {
    const existing = await financeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    const updateData = dto.verified
      ? {
          status: "verified",
          verifiedAt: new Date(),
          verifiedById: user?.id || null,
          verifiedByName: user?.name || null,
        }
      : {
          status: "pending",
          verifiedAt: null,
          verifiedById: null,
          verifiedByName: null,
        };

    const updated = await financeRepository.update(id, updateData);

    await financeRepository.logActivity({
      projectId: existing.projectId,
      category: "finance",
      action: dto.verified ? "VERIFY" : "UNVERIFY",
      description: dto.verified
        ? `Pembayaran "${existing.title}" sebesar Rp ${Number(existing.amount).toLocaleString(
            "id-ID"
          )} telah diverifikasi oleh ${user?.name || "Pengguna"}.`
        : `Verifikasi pembayaran "${existing.title}" dibatalkan oleh ${user?.name || "Pengguna"}.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: id,
        verified: dto.verified,
        amount: Number(existing.amount),
      },
    });

    return presentPayment(updated);
  },

  async updatePayment(id: string, dto: UpdatePaymentDto, user?: AuthUserPayload) {
    const existing = await financeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    const updateData: any = { ...dto };
    const updated = await financeRepository.update(id, updateData);

    await financeRepository.logActivity({
      projectId: existing.projectId,
      category: "finance",
      action: "UPDATE",
      description: `Termin pembayaran "${updated.title}" diperbarui.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: id,
        changes: dto,
      },
    });

    return presentPayment(updated);
  },

  async deletePayment(id: string, user?: AuthUserPayload) {
    const existing = await financeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    await financeRepository.delete(id);

    await financeRepository.logActivity({
      projectId: existing.projectId,
      category: "finance",
      action: "DELETE",
      description: `Termin pembayaran "${existing.title}" sebesar Rp ${Number(
        existing.amount
      ).toLocaleString("id-ID")} dihapus.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: id,
        title: existing.title,
        amount: Number(existing.amount),
      },
    });

    return presentPayment(existing);
  },

  /**
   * Menghitung ringkasan kas proyek (`contractValue`, `totalVerified`, `totalPending`,
   * `remainingBalance`, `totalInvoiced`, `hasVerifiedDp`, serta jumlah pembayaran dan termin).
   *
   * @param projectId - ID proyek target.
   * @throws {NotFoundError} Bila proyek tidak ditemukan.
   */
  async getFinanceSummary(projectId: string): Promise<FinanceSummary> {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const contractValue = Number(project.contractValue || 0);
    const [verified, pending, paymentsCount, terms] = await Promise.all([
      financeRepository.aggregateByProjectAndStatus(projectId, "verified"),
      financeRepository.aggregateByProjectAndStatus(projectId, "pending"),
      financeRepository.countByProjectId(projectId),
      financeRepository.findTermsByProjectId(projectId),
    ]);
    const totalVerified = Number(verified._sum.amount || 0);
    const totalPending = Number(pending._sum.amount || 0);

    const remainingBalance = Math.max(0, contractValue - totalVerified);
    const paidPercentage =
      contractValue > 0 ? Math.min(100, Math.round((totalVerified / contractValue) * 100)) : 0;

    const hasVerifiedDp =
      verified._count._all > 0 ||
      terms.some((t) => t.status === "paid" || t.status === "invoiced");

    const totalInvoiced = terms
      .filter((t) => t.status === "invoiced" || t.status === "paid")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      contractValue,
      totalVerified,
      totalPending,
      remainingBalance,
      paidPercentage,
      hasVerifiedDp,
      paymentsCount,
      termsCount: terms.length,
      totalInvoiced,
    };
  },
};

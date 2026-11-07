import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { financeRepository } from "./finance.repository.js";
import {
  CreateContractDto,
  CreatePaymentDto,
  FinanceSummary,
  IssueInvoiceDto,
  UpdatePaymentDto,
  UploadBastDto,
  VerifyPaymentDto,
} from "./finance.types.js";
import { cloudinaryStorage } from "../assets/cloudinary.service.js";

const presentPayment = <T extends { proofUrl?: string | null }>(payment: T): T => ({
  ...payment,
  proofUrl: payment.proofUrl ? cloudinaryStorage.deliveryUrl(payment.proofUrl) : payment.proofUrl,
});

export const financeService = {
  // =========================================================================
  // US-4: Kontrak & Termin Pembayaran 100% (AC-13, AC-14, AC-15)
  // =========================================================================

  /**
   * AC-13 (AC-B4-1): Membuat atau memperbarui kontrak proyek dengan termin berbobot total tepat 100%.
   * Termin terakhir otomatis menyerap selisih pembulatan rupiah.
   */
  async createContract(projectId: string, dto: CreateContractDto, user?: AuthUserPayload) {
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
    const hasLockedTerm = projectWithTerms?.paymentTerms.some((t) => t.isLocked);
    if (hasLockedTerm) {
      throw new ConflictError(
        "Konfigurasi kontrak tidak dapat diubah karena terdapat termin yang telah diterbitkan invoice atau terkunci."
      );
    }

    // 3. Kalkulasi nominal rupiah per termin & penyerapan pembulatan pada termin terakhir
    let allocatedAmount = 0;
    const processedTerms = dto.terms.map((term, index) => {
      const isLast = index === dto.terms.length - 1;
      let amount = 0;

      if (isLast) {
        // AC-13: Termin terakhir otomatis menyerap sisa selisih pembulatan
        amount = Math.round((dto.contractValue - allocatedAmount) * 100) / 100;
      } else {
        amount = Math.round((dto.contractValue * (term.percentage / 100)) * 100) / 100;
        allocatedAmount += amount;
      }

      return {
        termNumber: index + 1,
        title: term.title,
        percentage: term.percentage,
        amount,
        triggerType: term.triggerType || "manual",
        triggerSprintId: term.triggerSprintId,
        dueDate: term.dueDate,
        notes: term.notes,
      };
    });

    const savedTerms = await financeRepository.saveContractWithTerms(
      projectId,
      dto.contractValue,
      processedTerms
    );

    await financeRepository.logActivity({
      projectId,
      category: "finance",
      action: "CONTRACT_CREATE",
      description: `Kontrak proyek dibuat dengan nilai Rp ${dto.contractValue.toLocaleString(
        "id-ID"
      )} dan ${savedTerms.length} termin pembayaran berbobot 100%.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        contractValue: dto.contractValue,
        termsCount: savedTerms.length,
      },
    });

    return {
      contractValue: dto.contractValue,
      terms: savedTerms,
    };
  },

  async getProjectTerms(projectId: string) {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    return financeRepository.findTermsByProjectId(projectId);
  },

  async getTermById(id: string) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }
    return term;
  },

  /**
   * AC-14 (AC-B4-2): Unggah dokumen BAST dan ubah status termin menjadi 'ready' (Siap ditagih).
   */
  async markTermReadyWithBast(id: string, dto: UploadBastDto, user?: AuthUserPayload) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (!dto.bastUrl || !dto.bastUrl.trim()) {
      throw new BadRequestError("Dokumen bukti BAST wajib disertakan.");
    }

    // Jika trigger berbasis modul/sprint, validasi bahwa sprint trigger terkait telah selesai
    if (term.triggerType === "sprint" && term.triggerSprintId) {
      const sprint = await financeRepository.findSprintById(term.triggerSprintId);
      if (!sprint || sprint.status !== "completed") {
        throw new BadRequestError(
          `Sprint trigger "${sprint?.name || term.triggerSprintId}" belum diselesaikan. Selesaikan sprint terkait terlebih dahulu sebelum menandai termin siap ditagih.`
        );
      }
    }

    // Simpan BAST ke Cloudinary jika berupa data URL base64
    let finalBastUrl = dto.bastUrl;
    if (dto.bastUrl.startsWith("data:")) {
      try {
        finalBastUrl = await cloudinaryStorage.upload(
          dto.bastUrl,
          `cira-pm/projects/${term.projectId}/bast`
        );
      } catch {
        // Fallback jika Cloudinary offline / mock sandbox
        finalBastUrl = dto.bastUrl;
      }
    }

    const updated = await financeRepository.updateTerm(id, {
      bastUrl: finalBastUrl,
      bastFileName: dto.bastFileName || null,
      bastUploadedAt: new Date(),
      status: "ready",
    });

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "BAST_UPLOAD",
      description: `Dokumen BAST untuk "${term.title}" berhasil diunggah. Status termin kini Siap ditagih.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        termId: id,
        title: term.title,
        status: "ready",
        bastFileName: dto.bastFileName,
      },
    });

    return updated;
  },

  /**
   * AC-15 (AC-B4-3): Terbitkan invoice resmi bernomor seri otomatis INV-YYYY-NNN/Tn dan kunci termin.
   */
  async issueTermInvoice(id: string, dto: IssueInvoiceDto, user?: AuthUserPayload) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.isLocked || term.invoiceNumber) {
      throw new ConflictError(
        `Invoice untuk termin "${term.title}" sudah pernah diterbitkan dengan nomor ${term.invoiceNumber}.`
      );
    }

    if (term.status !== "ready") {
      throw new BadRequestError(
        `Termin "${term.title}" belum berstatus 'Siap ditagih' (ready). Unggah dokumen BAST terlebih dahulu sebelum menerbitkan invoice.`
      );
    }

    // Format Penomoran Seri Otomatis: INV-YYYY-NNN/Tn
    const year = new Date().getFullYear();
    const invoicedCount = await financeRepository.countInvoicedTermsInYear(year);
    const sequenceNumber = String(invoicedCount + 1).padStart(3, "0");
    const invoiceNumber = `INV-${year}-${sequenceNumber}/T${term.termNumber}`;

    const updated = await financeRepository.updateTerm(id, {
      invoiceNumber,
      invoiceIssuedAt: new Date(),
      status: "invoiced",
      isLocked: true, // Terkunci dari pengubahan atau penghapusan
      invoicePdfUrl: dto.invoicePdfUrl || term.invoicePdfUrl || null,
      notes: dto.notes ? `${term.notes || ""}\n${dto.notes}`.trim() : term.notes,
    });

    await financeRepository.logActivity({
      projectId: term.projectId,
      category: "finance",
      action: "INVOICE_ISSUE",
      description: `Invoice resmi ${invoiceNumber} diterbitkan untuk "${term.title}" sebesar Rp ${term.amount.toLocaleString(
        "id-ID"
      )}. Termin terkunci dari perubahan.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        termId: id,
        invoiceNumber,
        amount: term.amount,
        status: "invoiced",
        isLocked: true,
      },
    });

    return updated;
  },

  async deleteTerm(id: string, user?: AuthUserPayload) {
    const term = await financeRepository.findTermById(id);
    if (!term) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    if (term.isLocked) {
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

    const storedDto = dto.proofUrl?.startsWith("data:")
      ? { ...dto, proofUrl: await cloudinaryStorage.upload(dto.proofUrl, `cira-pm/projects/${projectId}/proofs`) }
      : dto;
    const payment = await financeRepository.create(projectId, storedDto);

    await financeRepository.logActivity({
      projectId,
      category: "finance",
      action: "CREATE",
      description: `Termin pembayaran "${payment.title}" sebesar Rp ${payment.amount.toLocaleString("id-ID")} berhasil ditambahkan.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: payment.id,
        title: payment.title,
        amount: payment.amount,
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
        ? `Pembayaran "${existing.title}" sebesar Rp ${existing.amount.toLocaleString("id-ID")} telah diverifikasi oleh ${user?.name || "Pengguna"}.`
        : `Verifikasi pembayaran "${existing.title}" dibatalkan oleh ${user?.name || "Pengguna"}.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: id,
        verified: dto.verified,
        amount: existing.amount,
      },
    });

    return presentPayment(updated);
  },

  async updatePayment(id: string, dto: UpdatePaymentDto, user?: AuthUserPayload) {
    const existing = await financeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    const nextProof = dto.proofUrl?.startsWith("data:")
      ? await cloudinaryStorage.upload(dto.proofUrl, `cira-pm/projects/${existing.projectId}/proofs`)
      : dto.proofUrl;
    const updateData: any = { ...dto, ...(nextProof ? { proofUrl: nextProof } : {}) };
    if (nextProof && nextProof !== existing.proofUrl) {
      updateData.proofUploadedAt = new Date();
    }

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

    if (nextProof && existing.proofUrl && nextProof !== existing.proofUrl) {
      await cloudinaryStorage.destroy(existing.proofUrl);
    }
    return presentPayment(updated);
  },

  async deletePayment(id: string, user?: AuthUserPayload) {
    const existing = await financeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Termin pembayaran dengan ID '${id}' tidak ditemukan.`);
    }

    await cloudinaryStorage.destroy(existing.proofUrl || "");
    await financeRepository.delete(id);

    await financeRepository.logActivity({
      projectId: existing.projectId,
      category: "finance",
      action: "DELETE",
      description: `Termin pembayaran "${existing.title}" sebesar Rp ${existing.amount.toLocaleString("id-ID")} dihapus.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        paymentId: id,
        title: existing.title,
        amount: existing.amount,
      },
    });

    return presentPayment(existing);
  },

  async getFinanceSummary(projectId: string): Promise<FinanceSummary> {
    const project = await financeRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const contractValue = project.contractValue || 0;
    const [verified, pending, paymentsCount, terms] = await Promise.all([
      financeRepository.aggregateByProjectAndStatus(projectId, "verified"),
      financeRepository.aggregateByProjectAndStatus(projectId, "pending"),
      financeRepository.countByProjectId(projectId),
      financeRepository.findTermsByProjectId(projectId),
    ]);
    const totalVerified = verified._sum.amount || 0;
    const totalPending = pending._sum.amount || 0;

    const remainingBalance = Math.max(0, contractValue - totalVerified);
    const paidPercentage = contractValue > 0 ? Math.min(100, Math.round((totalVerified / contractValue) * 100)) : 0;

    const hasVerifiedDp = verified._count._all > 0 || terms.some((t) => t.status === "paid" || t.status === "invoiced");

    const totalInvoiced = terms
      .filter((t) => t.status === "invoiced" || t.status === "paid")
      .reduce((sum, t) => sum + t.amount, 0);

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

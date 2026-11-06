import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { financeRepository } from "./finance.repository.js";
import { CreatePaymentDto, FinanceSummary, UpdatePaymentDto, VerifyPaymentDto } from "./finance.types.js";
import { cloudinaryStorage } from "../assets/cloudinary.service.js";

const presentPayment = <T extends { proofUrl?: string | null }>(payment: T): T => ({
  ...payment,
  proofUrl: payment.proofUrl ? cloudinaryStorage.deliveryUrl(payment.proofUrl) : payment.proofUrl,
});

export const financeService = {
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
    const [verified, pending, paymentsCount] = await Promise.all([
      financeRepository.aggregateByProjectAndStatus(projectId, "verified"),
      financeRepository.aggregateByProjectAndStatus(projectId, "pending"),
      financeRepository.countByProjectId(projectId),
    ]);
    const totalVerified = verified._sum.amount || 0;
    const totalPending = pending._sum.amount || 0;

    const remainingBalance = Math.max(0, contractValue - totalVerified);
    const paidPercentage = contractValue > 0 ? Math.min(100, Math.round((totalVerified / contractValue) * 100)) : 0;

    const hasVerifiedDp = verified._count._all > 0;

    return {
      contractValue,
      totalVerified,
      totalPending,
      remainingBalance,
      paidPercentage,
      hasVerifiedDp,
      paymentsCount,
    };
  },
};

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.config.js";
import { ConflictError } from "../../shared/errors/AppError.js";
import { getBusinessDateWib } from "../../shared/utils/businessDate.js";
import { CreatePaymentDto } from "./finance.types.js";

const termIncludes = {
  triggerSprint: { select: { id: true, name: true, status: true } },
  bast: { select: { mimeType: true } },
  invoiceFile: { select: { mimeType: true } },
};

export interface TermEvaluationActor {
  id?: string;
  name?: string;
  role?: string;
}

/**
 * BR-TERM-03, BR-TERM-04, BR-TERM-06:
 * Evaluator idempotent kesiapan termin (date & sprint) di dalam transaksi Prisma.
 * - Mengubah status planned -> ready dan mengisi readyAt HANYA sekali.
 * - Evaluasi ulang tidak menggeser readyAt, tidak menduplikasi history, dan tidak membuat invoice.
 */
export async function evaluateProjectTermReadinessInTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  now: Date = new Date(),
  actor?: TermEvaluationActor
): Promise<string[]> {
  const todayWib = getBusinessDateWib(now);
  const completedSprintCount = await tx.sprint.count({
    where: { projectId, status: "completed" },
  });

  const candidates = await tx.paymentTerm.findMany({
    where: {
      projectId,
      status: "planned",
      OR: [
        {
          triggerType: "date",
          triggerDate: { not: null, lte: todayWib },
        },
        {
          triggerType: "sprint",
          requiredCompletedSprints: { not: null, lte: completedSprintCount },
        },
      ],
    },
    select: {
      id: true,
      termNumber: true,
      title: true,
      triggerType: true,
      triggerDate: true,
      requiredCompletedSprints: true,
    },
  });

  if (candidates.length === 0) {
    return [];
  }

  const transitionedIds: string[] = [];

  for (const term of candidates) {
    const changed = await tx.paymentTerm.updateMany({
      where: {
        id: term.id,
        status: "planned",
        readyAt: null,
      },
      data: {
        status: "ready",
        readyAt: now,
      },
    });

    if (changed.count === 1) {
      await tx.activityLog.create({
        data: {
          projectId,
          category: "finance",
          action: "TERM_READY",
          description:
            term.triggerType === "sprint"
              ? `Termin #${term.termNumber} "${term.title}" otomatis siap ditagih (${completedSprintCount}/${term.requiredCompletedSprints} sprint selesai).`
              : `Termin #${term.termNumber} "${term.title}" otomatis siap ditagih (tanggal pemicu ${term.triggerDate} WIB tercapai).`,
          userId: actor?.id,
          userName: actor?.name,
          userRole: actor?.role,
          metadata: {
            termId: term.id,
            termNumber: term.termNumber,
            triggerType: term.triggerType,
            triggerDate: term.triggerDate,
            requiredCompletedSprints: term.requiredCompletedSprints,
            completedSprintCount,
            readyAt: now.toISOString(),
            automated: true,
          },
        },
      });
      transitionedIds.push(term.id);
    }
  }

  return transitionedIds;
}

export const financeRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, contractValue: true, status: true },
    });
  },

  async findProjectWithTerms(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      include: {
        paymentTerms: {
          orderBy: { termNumber: "asc" },
          include: termIncludes,
        },
      },
    });
  },

  async findTermsByProjectId(projectId: string) {
    return prisma.paymentTerm.findMany({
      where: { projectId },
      orderBy: { termNumber: "asc" },
      include: termIncludes,
    });
  },

  async findTermById(id: string) {
    return prisma.paymentTerm.findUnique({
      where: { id },
      include: {
        project: true,
        triggerSprint: true,
      },
    });
  },

  async countCompletedSprints(projectId: string): Promise<number> {
    return prisma.sprint.count({
      where: { projectId, status: "completed" },
    });
  },

  async findSprintById(sprintId: string) {
    return prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, name: true, status: true },
    });
  },

  async evaluateProjectTermReadiness(
    projectId: string,
    now: Date = new Date(),
    actor?: TermEvaluationActor
  ): Promise<string[]> {
    return prisma.$transaction((tx) =>
      evaluateProjectTermReadinessInTx(tx, projectId, now, actor)
    );
  },

  async saveContractWithTerms(
    projectId: string,
    contractValue: number,
    terms: Array<{
      termNumber: number;
      title: string;
      percentage: number;
      amount: number;
      triggerType: string;
      triggerDate?: string | null;
      requiredCompletedSprints?: number | null;
      triggerSprintId?: string | null;
      dueDate?: string | null;
      notes?: string | null;
    }>
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Update nilai kontrak pada proyek
      await tx.project.update({
        where: { id: projectId },
        data: { contractValue },
      });

      // 2. Hapus termin yang ada sebelumnya (hanya jika belum terkunci)
      await tx.paymentTerm.deleteMany({
        where: { projectId },
      });

      // 3. Masukkan daftar termin baru
      const createdTerms = [];
      for (const t of terms) {
        const created = await tx.paymentTerm.create({
          data: {
            projectId,
            termNumber: t.termNumber,
            title: t.title,
            percentage: t.percentage,
            amount: t.amount,
            triggerType: t.triggerType,
            triggerDate: t.triggerDate ?? null,
            requiredCompletedSprints: t.requiredCompletedSprints ?? null,
            triggerSprintId: t.triggerSprintId ?? null,
            dueDate: t.dueDate ?? null,
            notes: t.notes ?? null,
            status: "planned",
            readyAt: null,
            isLocked: false,
          },
          include: termIncludes,
        });
        createdTerms.push(created);
      }

      return createdTerms;
    });
  },

  async updateTerm(id: string, data: Record<string, unknown>) {
    return prisma.paymentTerm.update({
      where: { id },
      data,
      include: termIncludes,
    });
  },

  async markTermReadyAtomically(
    id: string,
    data: {
      readyAt: Date;
      notes?: string | null;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const changed = await tx.paymentTerm.updateMany({
        where: { id, status: "planned", isLocked: false },
        data: {
          status: "ready",
          readyAt: data.readyAt,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      });
      if (changed.count !== 1) return null;
      return tx.paymentTerm.findUnique({ where: { id }, include: termIncludes });
    });
  },

  async markTermPaidAtomically(id: string, paidAt: Date) {
    return prisma.$transaction(async (tx) => {
      const changed = await tx.paymentTerm.updateMany({
        where: { id, status: "invoiced" },
        data: {
          status: "paid",
          paidAt,
          isLocked: true,
        },
      });
      if (changed.count !== 1) return null;
      return tx.paymentTerm.findUnique({ where: { id }, include: termIncludes });
    });
  },

  async deleteTerm(id: string) {
    return prisma.paymentTerm.delete({
      where: { id },
    });
  },

  async countInvoicedTermsInYear(year: number): Promise<number> {
    return prisma.paymentTerm.count({
      where: {
        invoiceNumber: {
          startsWith: `INV-${year}-`,
        },
      },
    });
  },

  async issueInvoiceAtomically(
    id: string,
    year: number,
    termNumber: number,
    data: {
      invoiceNumber?: string;
      invoiceDueDate: string;
      invoiceIssuedAt: Date;
      status: string;
      isLocked: boolean;
      invoiceFileId: string | null;
      notes: string | null;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cira-invoice-${year}`}))`;

      let finalInvoiceNumber = data.invoiceNumber?.trim();
      if (finalInvoiceNumber) {
        const duplicate = await tx.paymentTerm.findFirst({
          where: { invoiceNumber: finalInvoiceNumber, id: { not: id } },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictError(
            `Nomor invoice "${finalInvoiceNumber}" sudah digunakan oleh termin lain.`
          );
        }
      } else {
        const count = await tx.paymentTerm.count({
          where: { invoiceNumber: { startsWith: `INV-${year}-` } },
        });
        let seq = count + 1;
        finalInvoiceNumber = `INV-${year}-${String(seq).padStart(3, "0")}/T${termNumber}`;
        while (
          await tx.paymentTerm.findFirst({
            where: { invoiceNumber: finalInvoiceNumber },
            select: { id: true },
          })
        ) {
          seq += 1;
          finalInvoiceNumber = `INV-${year}-${String(seq).padStart(3, "0")}/T${termNumber}`;
        }
      }

      const changed = await tx.paymentTerm.updateMany({
        where: { id, status: "ready", isLocked: false, invoiceNumber: null },
        data: {
          status: data.status,
          isLocked: data.isLocked,
          invoiceIssuedAt: data.invoiceIssuedAt,
          invoiceDueDate: data.invoiceDueDate,
          invoiceFileId: data.invoiceFileId,
          notes: data.notes,
          invoiceNumber: finalInvoiceNumber,
        },
      });
      if (changed.count !== 1) return null;

      const updated = await tx.paymentTerm.findUnique({ where: { id }, include: termIncludes });
      return { invoiceNumber: finalInvoiceNumber, updated };
    });
  },

  // Backward-compatible Payment queries
  async findByProjectId(projectId: string) {
    return prisma.payment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        verifiedBy: { select: { id: true, name: true, email: true } },
        proof: { select: { mimeType: true } },
      },
    });
  },

  async aggregateByProjectAndStatus(projectId: string, status: string) {
    return prisma.payment.aggregate({
      where: { projectId, status },
      _sum: { amount: true },
      _count: { _all: true },
    });
  },

  async countByProjectId(projectId: string) {
    return prisma.payment.count({ where: { projectId } });
  },

  async findById(id: string) {
    return prisma.payment.findUnique({ where: { id }, include: { verifiedBy: { select: { id: true, name: true, email: true } }, proof: { select: { mimeType: true } } } });
  },

  async create(projectId: string, data: CreatePaymentDto) {
    return prisma.payment.create({
      data: {
        projectId,
        title: data.title,
        amount: data.amount,
        dueDate: data.dueDate,
        notes: data.notes,
        proofFileId: null,
        proofUploadedAt: null,
        status: "pending",
      },
    });
  },

  async update(id: string, data: any) {
    return prisma.payment.update({
      where: { id },
      data,
      include: {
        verifiedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async delete(id: string) {
    return prisma.payment.delete({
      where: { id },
    });
  },

  async logActivity(data: {
    projectId: string;
    category: string;
    action: string;
    description: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    metadata?: any;
  }) {
    return prisma.activityLog.create({
      data: {
        projectId: data.projectId,
        category: data.category,
        action: data.action,
        description: data.description,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        metadata: data.metadata,
      },
    });
  },
};

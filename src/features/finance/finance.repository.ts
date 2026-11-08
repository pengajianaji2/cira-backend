import { prisma } from "../../config/db.config.js";
import { CreatePaymentDto } from "./finance.types.js";

const termIncludes = {
  triggerSprint: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
};

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

  async findSprintById(sprintId: string) {
    return prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, name: true, status: true },
    });
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
            triggerSprintId: t.triggerSprintId || null,
            dueDate: t.dueDate || null,
            notes: t.notes || null,
            status: "planned",
            isLocked: false,
          },
          include: termIncludes,
        });
        createdTerms.push(created);
      }

      return createdTerms;
    });
  },

  async updateTerm(id: string, data: any) {
    return prisma.paymentTerm.update({
      where: { id },
      data,
      include: termIncludes,
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
    data: { invoiceIssuedAt: Date; status: string; isLocked: boolean; invoicePdfUrl: string | null; notes: string | null },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cira-invoice-${year}`}))`;
      const count = await tx.paymentTerm.count({ where: { invoiceNumber: { startsWith: `INV-${year}-` } } });
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(3, "0")}`;
      const changed = await tx.paymentTerm.updateMany({
        where: { id, status: "ready", isLocked: false, invoiceNumber: null },
        data: { ...data, invoiceNumber: `${invoiceNumber}/T${termNumber}` },
      });
      if (changed.count !== 1) return null;
      const updated = await tx.paymentTerm.findUnique({ where: { id }, include: termIncludes });
      return { invoiceNumber: `${invoiceNumber}/T${termNumber}`, updated };
    });
  },

  // Backward-compatible Payment queries
  async findByProjectId(projectId: string) {
    return prisma.payment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
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
    return prisma.payment.findUnique({
      where: { id },
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

  async create(projectId: string, data: CreatePaymentDto) {
    return prisma.payment.create({
      data: {
        projectId,
        title: data.title,
        amount: data.amount,
        dueDate: data.dueDate,
        notes: data.notes,
        proofUrl: data.proofUrl,
        proofFileName: data.proofFileName,
        proofUploadedAt: data.proofUrl ? new Date() : null,
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

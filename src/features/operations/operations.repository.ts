import { prisma } from "../../config/db.config.js";
import {
  CalendarSourceType,
  OperationalEventType,
  ProjectStatusFilter,
} from "./operations.types.js";

export const INTERNAL_PROJECT_SENTINEL = "__internal__";

interface CalendarRepositoryQuery {
  from: string;
  to: string;
  rangeStartUtc: Date;
  rangeEndUtc: Date;
  todayWib: string;
  includeTypes: Set<CalendarSourceType>;
  projectStatuses: ProjectStatusFilter[];
  realProjectIds: string[];
  hasProjectFilter: boolean;
  includeInternal: boolean;
  includeCancelled: boolean;
}

export const operationsRepository = {
  async findProjectMinimalById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, status: true },
    });
  },

  async findEventById(id: string) {
    return prisma.operationalEvent.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        eventType: true,
        description: true,
        startAt: true,
        endAt: true,
        allDay: true,
        allDayStartDate: true,
        allDayEndDate: true,
        projectId: true,
        status: true,
        createdById: true,
        updatedById: true,
        cancelledAt: true,
        cancelledById: true,
        cancelReason: true,
        lastRemindedAt: true,
        lastRemindedById: true,
        reminderNote: true,
        reminderCount: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  },

  async createEvent(data: {
    title: string;
    eventType: OperationalEventType;
    description: string | null;
    projectId: string | null;
    allDay: boolean;
    allDayStartDate: string | null;
    allDayEndDate: string | null;
    startAt: Date;
    endAt: Date | null;
    createdById?: string;
  }) {
    return prisma.operationalEvent.create({
      data: {
        title: data.title,
        eventType: data.eventType,
        description: data.description,
        projectId: data.projectId,
        allDay: data.allDay,
        allDayStartDate: data.allDayStartDate,
        allDayEndDate: data.allDayEndDate,
        startAt: data.startAt,
        endAt: data.endAt,
        status: "scheduled",
        createdById: data.createdById ?? null,
        updatedById: data.createdById ?? null,
      },
      select: {
        id: true,
        title: true,
        eventType: true,
        description: true,
        startAt: true,
        endAt: true,
        allDay: true,
        allDayStartDate: true,
        allDayEndDate: true,
        projectId: true,
        status: true,
        reminderCount: true,
        lastRemindedAt: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  },

  async updateEvent(
    id: string,
    data: {
      title?: string;
      eventType?: OperationalEventType;
      description?: string | null;
      projectId?: string | null;
      allDay?: boolean;
      allDayStartDate?: string | null;
      allDayEndDate?: string | null;
      startAt?: Date;
      endAt?: Date | null;
      updatedById?: string;
    }
  ) {
    return prisma.operationalEvent.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        eventType: true,
        description: true,
        startAt: true,
        endAt: true,
        allDay: true,
        allDayStartDate: true,
        allDayEndDate: true,
        projectId: true,
        status: true,
        reminderCount: true,
        lastRemindedAt: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  },

  /**
   * BR-CAL-03 & AC-4.3: Pembatalan agenda bersifat soft status ('cancelled'), bukan hard delete.
   */
  async cancelEvent(
    id: string,
    data: { cancelledAt: Date; cancelledById?: string; cancelReason?: string }
  ) {
    return prisma.operationalEvent.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: data.cancelledAt,
        cancelledById: data.cancelledById ?? null,
        cancelReason: data.cancelReason ?? null,
        updatedById: data.cancelledById ?? null,
      },
      select: {
        id: true,
        title: true,
        eventType: true,
        description: true,
        startAt: true,
        endAt: true,
        allDay: true,
        allDayStartDate: true,
        allDayEndDate: true,
        projectId: true,
        status: true,
        cancelledAt: true,
        cancelReason: true,
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  },

  /**
   * BR-CAL-11: Tombol tindak lanjut / pengingat MVP hanya mencatat tindakan manual.
   */
  async recordReminder(
    id: string,
    data: { remindedAt: Date; remindedById?: string; note?: string }
  ) {
    return prisma.operationalEvent.update({
      where: { id },
      data: {
        lastRemindedAt: data.remindedAt,
        lastRemindedById: data.remindedById ?? null,
        reminderNote: data.note ?? null,
        reminderCount: { increment: 1 },
        updatedById: data.remindedById ?? null,
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        lastRemindedAt: true,
        reminderNote: true,
        reminderCount: true,
      },
    });
  },

  async logProjectActivity(data: {
    projectId: string;
    action: string;
    description: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.activityLog.create({
      data: {
        projectId: data.projectId,
        category: "project",
        action: data.action,
        description: data.description,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        metadata: data.metadata as any,
      },
    });
  },

  /**
   * Query agregasi paralel lintas Sprint, PaymentTerm readiness, Invoice dueDate,
   * dan OperationalEvent menggunakan select kolom minimal serta rentang tanggal terbatas (AC-4.1 & AC-4.5).
   */
  async findCalendarSourcesInRange(params: CalendarRepositoryQuery) {
    const queryProjectSources =
      !params.hasProjectFilter || params.realProjectIds.length > 0;

    const projectRelationWhere = {
      status: { in: params.projectStatuses },
      ...(params.realProjectIds.length > 0
        ? { id: { in: params.realProjectIds } }
        : {}),
    };

    const [sprints, readyTerms, invoicesInRange, overdueCarryoverInvoices, manualEvents] =
      await Promise.all([
        params.includeTypes.has("sprint") && queryProjectSources
          ? prisma.sprint.findMany({
              where: {
                startDate: { not: null, lte: params.rangeEndUtc },
                endDate: { not: null, gte: params.rangeStartUtc },
                project: projectRelationWhere,
              },
              select: {
                id: true,
                projectId: true,
                name: true,
                status: true,
                startDate: true,
                endDate: true,
                project: {
                  select: { id: true, name: true, status: true },
                },
              },
            })
          : Promise.resolve([]),

        params.includeTypes.has("payment_term") && queryProjectSources
          ? prisma.paymentTerm.findMany({
              where: {
                status: "ready",
                readyAt: {
                  not: null,
                  gte: params.rangeStartUtc,
                  lte: params.rangeEndUtc,
                },
                project: projectRelationWhere,
              },
              select: {
                id: true,
                projectId: true,
                termNumber: true,
                title: true,
                amount: true,
                status: true,
                readyAt: true,
                project: {
                  select: { id: true, name: true, status: true },
                },
              },
            })
          : Promise.resolve([]),

        params.includeTypes.has("invoice") && queryProjectSources
          ? prisma.paymentTerm.findMany({
              where: {
                status: { in: ["invoiced", "paid"] },
                invoiceDueDate: {
                  not: null,
                  gte: params.from,
                  lte: params.to,
                },
                project: projectRelationWhere,
              },
              select: {
                id: true,
                projectId: true,
                termNumber: true,
                title: true,
                amount: true,
                status: true,
                invoiceNumber: true,
                invoiceDueDate: true,
                paidAt: true,
                project: {
                  select: { id: true, name: true, status: true },
                },
              },
            })
          : Promise.resolve([]),

        // BR-CAL-09: invoice belum paid yang overdue sebelum `from` saat jendela kalender mencakup atau mendahului hari ini
        params.includeTypes.has("invoice") &&
        queryProjectSources &&
        params.to >= params.todayWib
          ? prisma.paymentTerm.findMany({
              where: {
                status: "invoiced",
                invoiceDueDate: {
                  not: null,
                  lt: params.from < params.todayWib ? params.from : params.todayWib,
                },
                project: projectRelationWhere,
              },
              select: {
                id: true,
                projectId: true,
                termNumber: true,
                title: true,
                amount: true,
                status: true,
                invoiceNumber: true,
                invoiceDueDate: true,
                paidAt: true,
                project: {
                  select: { id: true, name: true, status: true },
                },
              },
            })
          : Promise.resolve([]),

        params.includeTypes.has("operational_event")
          ? this.findOperationalEventsInRange(params)
          : Promise.resolve([]),
      ]);

    return {
      sprints,
      readyTerms,
      invoicesInRange,
      overdueCarryoverInvoices,
      manualEvents,
    };
  },

  async findOperationalEventsInRange(params: CalendarRepositoryQuery) {
    const scopeBranches: Record<string, unknown>[] = [];
    if (params.includeInternal) {
      scopeBranches.push({ projectId: null });
    }
    if (!params.hasProjectFilter || params.realProjectIds.length > 0) {
      scopeBranches.push({
        projectId: params.realProjectIds.length > 0 ? { in: params.realProjectIds } : { not: null },
        project: {
          status: { in: params.projectStatuses },
        },
      });
    }

    if (scopeBranches.length === 0) {
      return [];
    }

    return prisma.operationalEvent.findMany({
      where: {
        ...(params.includeCancelled ? {} : { status: "scheduled" }),
        AND: [
          { OR: scopeBranches },
          {
            OR: [
              {
                allDay: true,
                allDayStartDate: { not: null, lte: params.to },
                OR: [
                  { allDayEndDate: { gte: params.from } },
                  { allDayEndDate: null, allDayStartDate: { gte: params.from } },
                ],
              },
              {
                allDay: false,
                startAt: { lte: params.rangeEndUtc },
                OR: [
                  { endAt: { gte: params.rangeStartUtc } },
                  { endAt: null, startAt: { gte: params.rangeStartUtc } },
                ],
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        eventType: true,
        description: true,
        startAt: true,
        endAt: true,
        allDay: true,
        allDayStartDate: true,
        allDayEndDate: true,
        projectId: true,
        status: true,
        cancelledAt: true,
        cancelReason: true,
        lastRemindedAt: true,
        reminderNote: true,
        reminderCount: true,
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  },
};

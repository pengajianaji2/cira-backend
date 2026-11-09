import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import {
  BUSINESS_TIMEZONE,
  diffDaysInclusive,
  getBusinessDateWib,
  getCurrentMonthRangeWib,
  getWibSortTimestamp,
  isInvoiceOverdue,
  isValidDateOnly,
  wibDateEndToUtc,
  wibDateStartToUtc,
} from "../../shared/utils/businessDate.js";
import {
  CALENDAR_SOURCE_TYPES,
} from "./operations.schema.js";
import {
  INTERNAL_PROJECT_SENTINEL,
  operationsRepository,
} from "./operations.repository.js";
import {
  CalendarEvent,
  CalendarFeedResponse,
  CalendarQueryFilters,
  CalendarSourceType,
  CancelOperationalEventDto,
  CreateOperationalEventDto,
  OperationalEventType,
  ProjectStatusFilter,
  RecordReminderDto,
  UpdateOperationalEventDto,
} from "./operations.types.js";

function resolveEventWindow(input: {
  allDay: boolean;
  allDayStartDate?: string;
  allDayEndDate?: string | null;
  startAt?: string;
  endAt?: string | null;
}): {
  allDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  startAt: Date;
  endAt: Date | null;
} {
  if (input.allDay) {
    const startDate =
      input.allDayStartDate ??
      (input.startAt && isValidDateOnly(input.startAt) ? input.startAt : undefined);

    if (!startDate || !isValidDateOnly(startDate)) {
      throw new BadRequestError("Agenda sepanjang hari wajib mengisi tanggal mulai (YYYY-MM-DD).");
    }

    const endDate =
      input.allDayEndDate ??
      (input.endAt && isValidDateOnly(input.endAt) ? input.endAt : null);

    if (endDate && !isValidDateOnly(endDate)) {
      throw new BadRequestError("Tanggal selesai agenda sepanjang hari harus berformat YYYY-MM-DD.");
    }
    if (endDate && startDate > endDate) {
      throw new BadRequestError("Tanggal selesai tidak boleh mendahului tanggal mulai.");
    }

    return {
      allDay: true,
      allDayStartDate: startDate,
      allDayEndDate: endDate ?? startDate,
      startAt: wibDateStartToUtc(startDate),
      endAt: wibDateEndToUtc(endDate ?? startDate),
    };
  }

  if (!input.startAt) {
    throw new BadRequestError("Waktu mulai agenda wajib diisi.");
  }
  const startDate = new Date(input.startAt);
  if (Number.isNaN(startDate.getTime())) {
    throw new BadRequestError("Format waktu mulai (startAt) tidak valid.");
  }

  let endDate: Date | null = null;
  if (input.endAt) {
    endDate = new Date(input.endAt);
    if (Number.isNaN(endDate.getTime())) {
      throw new BadRequestError("Format waktu selesai (endAt) tidak valid.");
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestError("Waktu selesai tidak boleh mendahului waktu mulai.");
    }
  }

  return {
    allDay: false,
    allDayStartDate: null,
    allDayEndDate: null,
    startAt: startDate,
    endAt: endDate,
  };
}

function mapInvoiceToCalendarEvent(
  inv: {
    id: string;
    termNumber: number;
    title: string;
    amount: unknown;
    status: string;
    invoiceNumber: string | null;
    invoiceDueDate: string | null;
    paidAt: Date | null;
    project: { id: string; name: string; status: string };
  },
  now: Date
): CalendarEvent {
  const overdue = isInvoiceOverdue(inv, now);
  return {
    id: `invoice:${inv.id}`,
    sourceType: "invoice",
    sourceId: inv.id,
    title: `Invoice ${inv.invoiceNumber || `Termin #${inv.termNumber}`} · ${inv.project.name}`,
    startAt: inv.invoiceDueDate!,
    endAt: null,
    allDay: true,
    project: {
      id: inv.project.id,
      name: inv.project.name,
      status: inv.project.status,
    },
    status: inv.status,
    overdue,
    href: `/projects/${inv.project.id}?tab=finance`,
    metadata: {
      termNumber: inv.termNumber,
      amount: Number(inv.amount),
      invoiceNumber: inv.invoiceNumber,
      invoiceDueDate: inv.invoiceDueDate,
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    },
  };
}

/** Service domain Kalender Operasional lintas modul (Sprint, Termin, Invoice, Agenda Manual) berbasis WIB. */
export const operationsService = {
  /**
   * AC-4.1 & AC-4.5: Read-aggregation dinamis lintas Sprint, PaymentTerm readyAt,
   * Invoice dueDate, dan OperationalEvent dengan validasi batas 90 hari & sort kronologis WIB.
   */
  async getOperationalCalendar(
    filters: CalendarQueryFilters,
    now: Date = new Date()
  ): Promise<CalendarFeedResponse> {
    const defaultRange = getCurrentMonthRangeWib(now);
    const from = filters.from ?? defaultRange.from;
    const to = filters.to ?? defaultRange.to;

    if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
      throw new BadRequestError("Parameter 'from' dan 'to' harus berformat YYYY-MM-DD yang valid.");
    }
    if (from > to) {
      throw new BadRequestError("Tanggal 'from' tidak boleh melebihi tanggal 'to'.");
    }
    const spanDays = diffDaysInclusive(from, to);
    if (spanDays > 90) {
      throw new BadRequestError(
        `Rentang tanggal kalender dibatasi maksimal 90 hari (diminta ${spanDays} hari).`
      );
    }

    const includeTypes = new Set<CalendarSourceType>(
      filters.types?.length ? filters.types : CALENDAR_SOURCE_TYPES
    );
    const projectStatuses: ProjectStatusFilter[] = filters.projectStatuses?.length
      ? filters.projectStatuses
      : ["active"];

    const requestedIds = filters.projectIds ?? [];
    const hasProjectFilter = requestedIds.length > 0;
    const includeInternal =
      !hasProjectFilter || requestedIds.includes(INTERNAL_PROJECT_SENTINEL);
    const realProjectIds = requestedIds.filter(
      (id) => id !== INTERNAL_PROJECT_SENTINEL
    );

    const todayWib = getBusinessDateWib(now);
    const rangeStartUtc = wibDateStartToUtc(from);
    const rangeEndUtc = wibDateEndToUtc(to);

    const sources = await operationsRepository.findCalendarSourcesInRange({
      from,
      to,
      rangeStartUtc,
      rangeEndUtc,
      todayWib,
      includeTypes,
      projectStatuses,
      realProjectIds,
      hasProjectFilter,
      includeInternal,
      includeCancelled: Boolean(filters.includeCancelled),
    });

    const events: CalendarEvent[] = [];

    // 1. Proyeksi Sprint bertanggal lengkap (planning tanpa tanggal tidak diberi tanggal rekaan)
    for (const sprint of sources.sprints) {
      if (!sprint.startDate || !sprint.endDate) continue;
      events.push({
        id: `sprint:${sprint.id}`,
        sourceType: "sprint",
        sourceId: sprint.id,
        title: `${sprint.project.name} — ${sprint.name}`,
        startAt: getBusinessDateWib(sprint.startDate),
        endAt: getBusinessDateWib(sprint.endDate),
        allDay: true,
        project: {
          id: sprint.project.id,
          name: sprint.project.name,
          status: sprint.project.status,
        },
        status: sprint.status,
        href: `/projects/${sprint.project.id}?tab=sprints`,
      });
    }

    // 2. Proyeksi PaymentTerm readiness (readyAt)
    for (const term of sources.readyTerms) {
      if (!term.readyAt) continue;
      events.push({
        id: `payment_term:${term.id}`,
        sourceType: "payment_term",
        sourceId: term.id,
        title: `[Ready] ${term.project.name} - Termin #${term.termNumber}: ${term.title}`,
        startAt: term.readyAt.toISOString(),
        endAt: null,
        allDay: true,
        project: {
          id: term.project.id,
          name: term.project.name,
          status: term.project.status,
        },
        status: term.status,
        href: `/projects/${term.project.id}?tab=finance`,
        metadata: {
          termNumber: term.termNumber,
          amount: Number(term.amount),
        },
      });
    }

    // 3. Proyeksi Invoice Due Date & Status Overdue WIB
    for (const inv of sources.invoicesInRange) {
      if (!inv.invoiceDueDate) continue;
      events.push(mapInvoiceToCalendarEvent(inv, now));
    }

    // 4. Proyeksi OperationalEvent (Agenda Manual Internal/Proyek)
    for (const ev of sources.manualEvents) {
      events.push({
        id: `operational_event:${ev.id}`,
        sourceType: "operational_event",
        sourceId: ev.id,
        title: ev.title,
        startAt: ev.allDay
          ? ev.allDayStartDate ?? getBusinessDateWib(ev.startAt)
          : ev.startAt.toISOString(),
        endAt: ev.allDay
          ? ev.allDayEndDate ?? ev.allDayStartDate ?? null
          : ev.endAt
            ? ev.endAt.toISOString()
            : null,
        allDay: ev.allDay,
        project: ev.project
          ? {
              id: ev.project.id,
              name: ev.project.name,
              status: ev.project.status,
            }
          : null,
        status: ev.status,
        href: `/operations/calendar?eventId=${ev.id}`,
        metadata: {
          eventType: ev.eventType as OperationalEventType,
          description: ev.description,
          reminderCount: ev.reminderCount,
          lastRemindedAt: ev.lastRemindedAt ? ev.lastRemindedAt.toISOString() : null,
          reminderNote: ev.reminderNote,
          cancelledAt: ev.cancelledAt ? ev.cancelledAt.toISOString() : null,
          cancelReason: ev.cancelReason,
        },
      });
    }

    // Urutkan kronologis menaik berdasarkan waktu mulai di WIB (BR-CAL-07)
    events.sort((a, b) => {
      const diff = getWibSortTimestamp(a.startAt) - getWibSortTimestamp(b.startAt);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    const overdueCarryover = sources.overdueCarryoverInvoices
      .filter((inv) => inv.invoiceDueDate && isInvoiceOverdue(inv, now))
      .map((inv) => mapInvoiceToCalendarEvent(inv, now))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    return {
      range: {
        from,
        to,
        timezone: BUSINESS_TIMEZONE,
      },
      events,
      overdueCarryover,
    };
  },

  /**
   * Membuat agenda operasional manual (`client_demo`, `deployment`, `maintenance`, `meeting`).
   * Mendukung `projectId = null` (agenda internal agensi tanpa ActivityLog proyek).
   *
   * @param dto - Data agenda manual termasuk flag `allDay` atau waktu terjadwal `startAt`/`endAt`.
   * @param user - Pengguna pembuat agenda.
   * @throws {NotFoundError} Bila `projectId` diisi tetapi proyek tidak ditemukan.
   * @throws {BadRequestError} Bila tanggal/waktu agenda tidak lengkap atau rentang terbalik.
   */
  async createOperationalEvent(
    dto: CreateOperationalEventDto,
    user?: AuthUserPayload
  ) {
    const normalizedProjectId = dto.projectId ? dto.projectId : null;
    if (normalizedProjectId) {
      const project = await operationsRepository.findProjectMinimalById(normalizedProjectId);
      if (!project) {
        throw new NotFoundError(`Proyek dengan ID '${normalizedProjectId}' tidak ditemukan.`);
      }
    }

    const window = resolveEventWindow({
      allDay: dto.allDay,
      allDayStartDate: dto.allDayStartDate,
      allDayEndDate: dto.allDayEndDate,
      startAt: dto.startAt,
      endAt: dto.endAt,
    });

    const created = await operationsRepository.createEvent({
      title: dto.title.trim(),
      eventType: dto.eventType,
      description: dto.description ?? null,
      projectId: normalizedProjectId,
      ...window,
      createdById: user?.id,
    });

    if (normalizedProjectId) {
      await operationsRepository.logProjectActivity({
        projectId: normalizedProjectId,
        action: "OPERATIONAL_EVENT_CREATE",
        description: `Agenda operasional "${created.title}" (${created.eventType}) dijadwalkan.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: {
          eventId: created.id,
          eventType: created.eventType,
          allDay: created.allDay,
        },
      });
    }

    return created;
  },

  /**
   * Memperbarui agenda operasional manual yang belum dibatalkan (`status !== 'cancelled'`).
   *
   * @param id - ID agenda operasional target.
   * @param dto - Perubahan atribut atau jadwal agenda.
   * @param user - Pengguna pelaku pembaruan.
   * @throws {NotFoundError} Bila agenda atau proyek tujuan tidak ditemukan.
   * @throws {BadRequestError} Bila agenda sudah dibatalkan atau jadwal baru tidak valid.
   */
  async updateOperationalEvent(
    id: string,
    dto: UpdateOperationalEventDto,
    user?: AuthUserPayload
  ) {
    const existing = await operationsRepository.findEventById(id);
    if (!existing) {
      throw new NotFoundError(`Agenda operasional dengan ID '${id}' tidak ditemukan.`);
    }
    if (existing.status === "cancelled") {
      throw new BadRequestError("Agenda yang telah dibatalkan tidak dapat diubah.");
    }

    let nextProjectId = existing.projectId;
    if (dto.projectId !== undefined) {
      nextProjectId = dto.projectId ? dto.projectId : null;
      if (nextProjectId) {
        const project = await operationsRepository.findProjectMinimalById(nextProjectId);
        if (!project) {
          throw new NotFoundError(`Proyek dengan ID '${nextProjectId}' tidak ditemukan.`);
        }
      }
    }

    const effectiveAllDay = dto.allDay ?? existing.allDay;
    const window = resolveEventWindow({
      allDay: effectiveAllDay,
      allDayStartDate:
        dto.allDayStartDate ??
        (existing.allDayStartDate ?? getBusinessDateWib(existing.startAt)),
      allDayEndDate:
        dto.allDayEndDate !== undefined
          ? dto.allDayEndDate
          : existing.allDayEndDate ?? existing.allDayStartDate,
      startAt: dto.startAt ?? existing.startAt.toISOString(),
      endAt:
        dto.endAt !== undefined
          ? dto.endAt
          : existing.endAt
            ? existing.endAt.toISOString()
            : null,
    });

    const updated = await operationsRepository.updateEvent(id, {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.projectId !== undefined ? { projectId: nextProjectId } : {}),
      ...window,
      updatedById: user?.id,
    });

    if (updated.projectId) {
      await operationsRepository.logProjectActivity({
        projectId: updated.projectId,
        action: "OPERATIONAL_EVENT_UPDATE",
        description: `Agenda operasional "${updated.title}" diperbarui.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: { eventId: id, eventType: updated.eventType },
      });
    }

    return updated;
  },

  /**
   * AC-4.3 & BR-CAL-03: Soft cancel mengubah status ke 'cancelled' tanpa hard delete.
   */
  async cancelOperationalEvent(
    id: string,
    dto: CancelOperationalEventDto,
    user?: AuthUserPayload,
    now: Date = new Date()
  ) {
    const existing = await operationsRepository.findEventById(id);
    if (!existing) {
      throw new NotFoundError(`Agenda operasional dengan ID '${id}' tidak ditemukan.`);
    }
    if (existing.status === "cancelled") {
      throw new BadRequestError("Agenda operasional ini sudah berstatus dibatalkan (cancelled).");
    }

    const cancelled = await operationsRepository.cancelEvent(id, {
      cancelledAt: now,
      cancelledById: user?.id,
      cancelReason: dto.cancelReason,
    });

    if (cancelled.projectId) {
      await operationsRepository.logProjectActivity({
        projectId: cancelled.projectId,
        action: "OPERATIONAL_EVENT_CANCEL",
        description: `Agenda operasional "${cancelled.title}" dibatalkan.${dto.cancelReason ? ` Alasan: ${dto.cancelReason}` : ""}`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: { eventId: id, cancelReason: dto.cancelReason ?? null },
      });
    }

    return cancelled;
  },

  /**
   * BR-CAL-11: Pencatatan tindak lanjut manual MVP (tidak mengklaim mengirim Email/WhatsApp).
   */
  async recordOperationalEventReminder(
    id: string,
    dto: RecordReminderDto,
    user?: AuthUserPayload,
    now: Date = new Date()
  ) {
    const existing = await operationsRepository.findEventById(id);
    if (!existing) {
      throw new NotFoundError(`Agenda operasional dengan ID '${id}' tidak ditemukan.`);
    }
    if (existing.status === "cancelled") {
      throw new BadRequestError("Tidak dapat mencatat tindak lanjut untuk agenda yang telah dibatalkan.");
    }

    const updated = await operationsRepository.recordReminder(id, {
      remindedAt: now,
      remindedById: user?.id,
      note: dto.note,
    });

    if (updated.projectId) {
      await operationsRepository.logProjectActivity({
        projectId: updated.projectId,
        action: "OPERATIONAL_EVENT_FOLLOWUP",
        description: `Tindak lanjut manual dicatat untuk agenda "${updated.title}" (ke-${updated.reminderCount}).`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: {
          eventId: id,
          reminderCount: updated.reminderCount,
          note: dto.note ?? null,
        },
      });
    }

    return updated;
  },
};

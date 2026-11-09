export type CalendarSourceType =
  | "sprint"
  | "payment_term"
  | "invoice"
  | "operational_event";

export type OperationalEventType =
  | "client_demo"
  | "deployment"
  | "maintenance"
  | "meeting";

export type OperationalEventStatus = "scheduled" | "cancelled";

export type ProjectStatusFilter = "lead" | "active" | "completed" | "cancelled";

export interface CalendarEventMetadata {
  eventType?: OperationalEventType;
  description?: string | null;
  termNumber?: number;
  amount?: number;
  invoiceNumber?: string | null;
  invoiceDueDate?: string | null;
  paidAt?: string | null;
  reminderCount?: number;
  lastRemindedAt?: string | null;
  reminderNote?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface CalendarEvent {
  id: string; // `${sourceType}:${sourceId}`
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  project?: { id: string; name: string; status?: string } | null;
  status: string;
  overdue?: boolean;
  href: string;
  metadata?: CalendarEventMetadata;
}

export interface CalendarQueryFilters {
  from?: string;
  to?: string;
  types?: CalendarSourceType[];
  projectIds?: string[];
  projectStatuses?: ProjectStatusFilter[];
  includeCancelled?: boolean;
}

export interface CalendarFeedResponse {
  range: {
    from: string;
    to: string;
    timezone: "Asia/Jakarta";
  };
  events: CalendarEvent[];
  overdueCarryover: CalendarEvent[];
}

export interface CreateOperationalEventDto {
  title: string;
  eventType: OperationalEventType;
  description?: string | null;
  projectId?: string | null;
  allDay: boolean;
  allDayStartDate?: string;
  allDayEndDate?: string | null;
  startAt?: string;
  endAt?: string | null;
}

export interface UpdateOperationalEventDto {
  title?: string;
  eventType?: OperationalEventType;
  description?: string | null;
  projectId?: string | null;
  allDay?: boolean;
  allDayStartDate?: string;
  allDayEndDate?: string | null;
  startAt?: string;
  endAt?: string | null;
}

export interface CancelOperationalEventDto {
  cancelReason?: string;
}

export interface RecordReminderDto {
  note?: string;
}

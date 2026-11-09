export const BUSINESS_TIMEZONE = "Asia/Jakarta";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const wibDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Validasi format YYYY-MM-DD dan kebenaran tanggal kalender (misal menolak 2026-02-30).
 */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Menghasilkan representasi date-only YYYY-MM-DD berdasarkan timezone bisnis resmi Asia/Jakarta (WIB).
 */
export function getBusinessDateWib(date: Date = new Date()): string {
  const parts = wibDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/**
 * BR-TERM-09: Invoice overdue jika masih berstatus 'invoiced' (belum 'paid')
 * dan tanggal hari ini di timezone Asia/Jakarta melewati invoiceDueDate.
 */
export function isInvoiceOverdue(
  term: { status: string; invoiceDueDate?: string | null },
  now: Date = new Date()
): boolean {
  if (term.status !== "invoiced" || !term.invoiceDueDate) {
    return false;
  }
  if (!isValidDateOnly(term.invoiceDueDate)) {
    return false;
  }
  const todayWib = getBusinessDateWib(now);
  return todayWib > term.invoiceDueDate;
}

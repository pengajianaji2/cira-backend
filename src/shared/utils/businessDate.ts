export const BUSINESS_TIMEZONE = "Asia/Jakarta";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

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
 * Mengonversi YYYY-MM-DD ke batas awal hari 00:00:00.000+07:00 dalam UTC Date.
 */
export function wibDateStartToUtc(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000+07:00`);
}

/**
 * Mengonversi YYYY-MM-DD ke batas akhir hari 23:59:59.999+07:00 dalam UTC Date.
 */
export function wibDateEndToUtc(dateOnly: string): Date {
  return new Date(`${dateOnly}T23:59:59.999+07:00`);
}

/**
 * Menghitung selisih hari inklusif antara dua tanggal YYYY-MM-DD kalender murni.
 * Misal from == to menghasilkan 1 hari; rentang 90 hari kalender menghasilkan <= 90.
 */
export function diffDaysInclusive(fromDateOnly: string, toDateOnly: string): number {
  const [fy, fm, fd] = fromDateOnly.split("-").map(Number);
  const [ty, tm, td] = toDateOnly.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.floor((toUtc - fromUtc) / MS_PER_DAY) + 1;
}

/**
 * Mengembalikan rentang tanggal bulan berjalan [YYYY-MM-01, YYYY-MM-last] menurut WIB.
 */
export function getCurrentMonthRangeWib(now: Date = new Date()): { from: string; to: string } {
  const today = getBusinessDateWib(now);
  const [yearStr, monthStr] = today.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${yearStr}-${monthStr}-01`,
    to: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Menghasilkan nilai epoch milidetik konsisten di WIB untuk pengurutan campuran
 * date-only all-day (00:00 WIB) dan ISO timestamp.
 */
export function getWibSortTimestamp(value: string | Date): number {
  if (typeof value === "string" && isValidDateOnly(value)) {
    return wibDateStartToUtc(value).getTime();
  }
  return new Date(value).getTime();
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

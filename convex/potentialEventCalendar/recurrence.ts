export type RecurrenceInterval = "daily" | "weekly" | "monthly";

const MAX_OCCURRENCES = 366;

function parseYmd(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}

function toYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toUtcDate(value: string): Date {
  const { y, m, d } = parseYmd(value);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysYmd(value: string, days: number): string {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

function addMonthsYmd(value: string, months: number): string {
  const { y, m, d } = parseYmd(value);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return toYmd(date);
}

function stepDate(value: string, interval: RecurrenceInterval): string {
  switch (interval) {
    case "daily":
      return addDaysYmd(value, 1);
    case "weekly":
      return addDaysYmd(value, 7);
    case "monthly":
      return addMonthsYmd(value, 1);
  }
}

export function daySpanInclusive(start: string, end: string): number {
  const startMs = toUtcDate(start).getTime();
  const endMs = toUtcDate(end).getTime();
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

export function expandRecurrenceDates(
  startDate: string,
  until: string,
  interval: RecurrenceInterval,
): string[] {
  const dates: string[] = [];
  let current = startDate;

  while (current <= until && dates.length < MAX_OCCURRENCES) {
    dates.push(current);
    const next = stepDate(current, interval);
    if (next === current) break;
    current = next;
  }

  return dates;
}

export function createRecurrenceSeriesId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

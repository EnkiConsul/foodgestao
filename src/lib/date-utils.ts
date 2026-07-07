import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

export type DateInput = Date | string | number | null | undefined;
export type DayTime = "start" | "midday" | "end";

/**
 * Parses a value into a Date accepting:
 * - Date (returned as-is when valid)
 * - number (epoch ms)
 * - "YYYY-MM-DD" or ISO strings (parsed as local, avoids TZ shift for dates)
 * - "DD/MM/YYYY" or "DD-MM-YY" strings
 * `time` controls the wall-clock time attached to date-only inputs.
 */
export function parseFlexibleDate(value: DateInput, time: DayTime = "midday"): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) return isValid(value) ? value : null;

  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?.*)?$/);
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  let year: number;
  let month: number;
  let day: number;
  let hours: number | null = null;
  let minutes = 0;
  let seconds = 0;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
    if (iso[4]) {
      hours = Number(iso[4]);
      minutes = Number(iso[5]);
      seconds = iso[6] ? Number(iso[6]) : 0;
    }
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
    if (year < 100) year += 2000;
  } else {
    const d = new Date(raw);
    return isValid(d) ? d : null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  if (hours == null) {
    const defaults: Record<DayTime, [number, number, number, number]> = {
      end: [23, 59, 59, 999],
      start: [0, 0, 0, 0],
      midday: [12, 0, 0, 0],
    };
    const [h, m, s, ms] = defaults[time];
    hours = h;
    minutes = m;
    seconds = s;
    const parsed = new Date(year, month - 1, day, hours, minutes, seconds, ms);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
      ? parsed
      : null;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, seconds);
  return isValid(parsed) ? parsed : null;
}

export interface FormatDateOptions {
  placeholder?: string;
  time?: DayTime;
  locale?: Locale;
}

type Locale = Parameters<typeof format>[2] extends { locale?: infer L } ? L : never;

/**
 * Safe date formatter. Accepts any DateInput, never throws — returns
 * `placeholder` (default "—") when the value cannot be parsed.
 */
export function formatDate(
  value: DateInput,
  pattern: string,
  options: FormatDateOptions = {}
): string {
  const { placeholder = "—", time = "midday", locale = ptBR } = options;
  const parsed = parseFlexibleDate(value, time);
  if (!parsed) return placeholder;
  try {
    return format(parsed, pattern, { locale });
  } catch {
    return placeholder;
  }
}

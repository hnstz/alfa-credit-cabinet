const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const shortDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
const monthYearFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "24 октября 2026 г." */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "24 октября" */
export function formatDayMonth(iso: string): string {
  return dayMonthFormat.format(new Date(iso));
}

/** "14:05" */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "24 окт., 14:05" */
export function formatDateTime(iso: string): string {
  return `${shortDateFormat.format(new Date(iso))}, ${timeFormat.format(new Date(iso))}`;
}

/** "2026-09" -> "сент." */
export function formatMonth(yearMonth: string): string {
  return monthFormat.format(new Date(`${yearMonth}-01T00:00:00`));
}

/** "2026-09" -> "сентябрь 2026 г." */
export function formatMonthYear(yearMonth: string): string {
  return monthYearFormat.format(new Date(`${yearMonth}-01T00:00:00`));
}

/** "только что", "5 мин назад", "3 ч назад", дальше — дата и время. `now` передаём снаружи: рендер должен быть чистым. */
export function formatRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MINUTE) return 'только что';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} мин назад`;
  if (diff < 12 * HOUR) return `${Math.floor(diff / HOUR)} ч назад`;
  return formatDateTime(iso);
}

/** Длительность для SLA: "12 мин", "3 ч 20 мин", "2 дн." */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MINUTE));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
  return `${Math.floor(hours / 24)} дн.`;
}

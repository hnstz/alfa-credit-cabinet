export type ClassValue = string | false | null | undefined;

/** Склеивает css-классы, пропуская "пустые" значения. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}

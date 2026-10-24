const rules = new Intl.PluralRules('ru-RU');

/** plural(5, ['месяц', 'месяца', 'месяцев']) -> 'месяцев' */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const rule = rules.select(n);
  if (rule === 'one') return one;
  if (rule === 'few') return few;
  return many;
}

/** 18 -> "18 месяцев" */
export function formatMonths(n: number): string {
  return `${n}\u00A0${plural(n, ['месяц', 'месяца', 'месяцев'])}`;
}

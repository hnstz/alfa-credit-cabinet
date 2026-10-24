const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** 1500000 -> "1 500 000" (неразрывные пробелы) */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** 1500000 -> "1 500 000 ₽" */
export function formatMoney(value: number, currency = '₽'): string {
  return `${numberFormat.format(value)}\u00A0${currency}`;
}

/** Для подписей на графиках: 1500000 -> "1,5 млн ₽", 650000 -> "650 тыс. ₽" */
export function formatMoneyShort(value: number, currency = '₽'): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${compactFormat.format(value / 1_000_000)}\u00A0млн\u00A0${currency}`;
  if (abs >= 1_000) return `${numberFormat.format(Math.round(value / 1_000))}\u00A0тыс.\u00A0${currency}`;
  return formatMoney(value, currency);
}

/** 17.5 -> "17,5 %" */
export function formatPercent(value: number, fractionDigits = 1): string {
  const text = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${text}\u00A0%`;
}

/** Достаёт из строки только цифры: "1 5a0" -> 150. Пусто -> null */
export function parseDigits(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

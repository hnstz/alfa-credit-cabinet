/**
 * Аннуитетные расчёты. Используются и в интерфейсе (примерный платёж в анкете),
 * и в мок-скоринге — поэтому формулы в одном месте.
 */

/** Ежемесячный платёж, ₽ (округлён до рубля). */
export function annuityPayment(amount: number, ratePercent: number, months: number): number {
  if (amount <= 0 || months <= 0) return 0;
  const r = ratePercent / 1200;
  if (r === 0) return Math.round(amount / months);
  return Math.round((amount * r) / (1 - (1 + r) ** -months));
}

/** Максимальная сумма кредита при заданном платеже. */
export function maxPrincipal(payment: number, ratePercent: number, months: number): number {
  if (payment <= 0 || months <= 0) return 0;
  const r = ratePercent / 1200;
  if (r === 0) return payment * months;
  return (payment * (1 - (1 + r) ** -months)) / r;
}

/** Переплата за весь срок, ₽. */
export function overpayment(amount: number, ratePercent: number, months: number): number {
  return annuityPayment(amount, ratePercent, months) * months - amount;
}

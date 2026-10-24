import type { LoanTerms } from '@/entities/application';

export interface ScheduleRow {
  n: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Аннуитетный график: как делится платёж на проценты и основной долг. */
export function buildSchedule(terms: LoanTerms, limit = terms.termMonths): ScheduleRow[] {
  const r = terms.ratePercent / 1200;
  let balance = terms.amount;
  const rows: ScheduleRow[] = [];
  for (let n = 1; n <= Math.min(limit, terms.termMonths); n++) {
    const interest = Math.round(balance * r);
    const principal = n === terms.termMonths ? balance : terms.monthlyPayment - interest;
    balance = Math.max(0, balance - principal);
    rows.push({ n, payment: interest + principal, interest, principal, balance });
  }
  return rows;
}

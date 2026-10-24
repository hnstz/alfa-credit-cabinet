/** Продукты клиента в банке — для сводки на дашборде. */

export interface AccountProduct {
  id: string;
  kind: 'ACCOUNT';
  title: string;
  /** "•• 4521" */
  maskedNumber: string;
  balance: number;
}

export interface LoanProduct {
  id: string;
  kind: 'LOAN';
  title: string;
  contractNumber: string;
  amount: number;
  /** Остаток долга, ₽ */
  debt: number;
  ratePercent: number;
  nextPayment: { date: string; amount: number };
  endDate: string;
  /** Заявка, по которой выдан кредит (если оформлен в кабинете). */
  applicationId?: string;
}

export type Product = AccountProduct | LoanProduct;

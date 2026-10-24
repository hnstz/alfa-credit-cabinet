import type { LegalForm } from '@/entities/user';
import type { ApplicationStatus } from './status';

/* =========================================================
   Анкета (то, что заполняет клиент)
   ========================================================= */

export type ProductCode = 'WORKING_CAPITAL' | 'INVESTMENT' | 'EQUIPMENT' | 'CREDIT_LINE';
export type LoanPurpose =
  | 'STOCK'
  | 'CASH_GAP'
  | 'EQUIPMENT'
  | 'EXPANSION'
  | 'CONTRACT'
  | 'REFINANCE'
  | 'OTHER';
export type TaxSystem = 'USN_INCOME' | 'USN_PROFIT' | 'OSNO' | 'PSN' | 'AUSN';
export type MaritalStatus = 'SINGLE' | 'MARRIED';
export type CollateralType = 'NONE' | 'REAL_ESTATE' | 'VEHICLE' | 'EQUIPMENT' | 'GUARANTOR';

export interface Founder {
  id: string;
  name: string;
  /** Доля в уставном капитале, % */
  share: number | null;
}

export interface LoanSection {
  product: ProductCode | '';
  amount: number | null;
  termMonths: number | null;
  purpose: LoanPurpose | '';
  /** Обязателен, если цель — «Другое». */
  purposeComment: string;
}

/**
 * Данные о бизнесе. Поля юрлица и ИП хранятся вместе (так проще мастеру),
 * а валидация и отправка учитывают только нужные для выбранной формы.
 */
export interface CompanySection {
  legalForm: LegalForm;
  name: string;
  inn: string;
  /** ОГРН (ООО) или ОГРНИП (ИП) */
  ogrn: string;
  okved: string;
  region: string;
  registeredAt: string;
  employees: number | null;
  taxSystem: TaxSystem | '';
  // --- только ООО ---
  kpp: string;
  directorName: string;
  founders: Founder[];
  // --- только ИП ---
  maritalStatus: MaritalStatus | '';
  spouseName: string;
  spouseConsent: boolean;
}

export interface FinanceSection {
  /** Средняя выручка в месяц, ₽ */
  monthlyRevenue: number | null;
  /** Средние расходы в месяц (без платежей по кредитам), ₽ */
  monthlyExpenses: number | null;
  hasOtherLoans: boolean;
  /** Платежи по другим кредитам в месяц, ₽ */
  otherLoansPayment: number | null;
  collateral: CollateralType;
  collateralValue: number | null;
}

export interface ContactsSection {
  contactName: string;
  phone: string;
  email: string;
}

export interface ConsentsSection {
  /** Согласие на запрос кредитной истории */
  creditHistory: boolean;
  /** Согласие на обработку данных */
  dataProcessing: boolean;
}

export interface ApplicationForm {
  loan: LoanSection;
  company: CompanySection;
  finance: FinanceSection;
  contacts: ContactsSection;
  consents: ConsentsSection;
}

/** Путь к полю анкеты: 'loan.amount', 'company.founders.0.share'. Для ошибок и отметки «заполнено банком». */
export type FieldPath = string;

export interface ApplicationDraft {
  id: string;
  form: ApplicationForm;
  /** Шаг мастера, на котором клиент остановился. */
  step: number;
  updatedAt: string;
  /** Поля, предзаполненные из данных банка. */
  prefilled: FieldPath[];
}

/** Параметры, с которыми клиент пришёл из персонального предложения в ленте. */
export interface DraftPreset {
  product?: ProductCode;
  amount?: number;
  termMonths?: number;
}

/* =========================================================
   Условия и решение (то, что видит клиент)
   ========================================================= */

export interface RequestedTerms {
  amount: number;
  termMonths: number;
}

export interface LoanTerms extends RequestedTerms {
  ratePercent: number;
  monthlyPayment: number;
}

export type DecisionKind = 'APPROVED' | 'COUNTER_OFFER' | 'REJECTED';

export interface ClientRejectReason {
  title: string;
  text: string;
}

/** Решение глазами клиента: без внутренних оценок риска и банковских терминов. */
export type ClientDecision =
  | { kind: 'APPROVED'; offer: LoanTerms; decidedAt: string; validUntil: string }
  | {
      kind: 'COUNTER_OFFER';
      requested: RequestedTerms;
      offer: LoanTerms;
      /** Простое объяснение, почему условия другие. */
      explanation: string;
      decidedAt: string;
      validUntil: string;
    }
  | {
      kind: 'REJECTED';
      reason: ClientRejectReason;
      advice: string[];
      /** Сумма, на которую стоит попробовать подать заявку (если есть). */
      suggestedAmount: number | null;
      decidedAt: string;
    };

export interface StatusHistoryItem {
  status: ApplicationStatus;
  at: string;
}

export interface ApplicationSummary {
  id: string;
  number: string;
  status: ApplicationStatus;
  product: ProductCode;
  amount: number;
  termMonths: number;
  createdAt: string;
  updatedAt: string;
}

export interface SigningDocument {
  id: string;
  title: string;
  description: string;
  pages: number;
}

export interface SigningInfo {
  documents: SigningDocument[];
  signedAt: string | null;
  /** Куда отправлен код подтверждения (маска телефона). */
  phoneMask: string;
}

export interface ClientApplication extends ApplicationSummary {
  purpose: LoanPurpose;
  submittedAt: string;
  history: StatusHistoryItem[];
  decision: ClientDecision | null;
  signing: SigningInfo | null;
  /** Ориентир, когда завершится текущий автоматический этап. */
  stageEta: string | null;
}

/** Короткая сводка о черновике — для дашборда. */
export interface DraftSummary {
  id: string;
  step: number;
  totalSteps: number;
  updatedAt: string;
  product: ProductCode | '';
  amount: number | null;
}

import type { BadgeTone } from '@/shared/ui';
import type { RejectReasonCode, RiskLevel } from './bank';
import type {
  CollateralType,
  DecisionKind,
  LoanPurpose,
  MaritalStatus,
  ProductCode,
  TaxSystem,
} from './types';

/** Справочники анкеты. Тексты — для клиента, без банковского жаргона. */

export interface ProductInfo {
  title: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  terms: readonly number[];
  /** Ставка «от» для предварительного расчёта платежа в анкете, % годовых. */
  rateFrom: number;
}

export const PRODUCTS: Record<ProductCode, ProductInfo> = {
  WORKING_CAPITAL: {
    title: 'На пополнение оборота',
    description: 'Закупка товара, зарплаты, аренда, налоги',
    minAmount: 100_000,
    maxAmount: 30_000_000,
    terms: [6, 12, 18, 24, 36],
    rateFrom: 17.5,
  },
  INVESTMENT: {
    title: 'На развитие бизнеса',
    description: 'Ремонт, новая точка, расширение производства',
    minAmount: 500_000,
    maxAmount: 50_000_000,
    terms: [12, 24, 36, 48, 60],
    rateFrom: 16.9,
  },
  EQUIPMENT: {
    title: 'На оборудование и транспорт',
    description: 'Станки, техника, автомобили для бизнеса',
    minAmount: 300_000,
    maxAmount: 50_000_000,
    terms: [12, 24, 36, 48, 60],
    rateFrom: 16.5,
  },
  CREDIT_LINE: {
    title: 'Кредитная линия',
    description: 'Берёте деньги частями, когда нужно, и платите только за использованное',
    minAmount: 500_000,
    maxAmount: 30_000_000,
    terms: [12, 18, 24, 36],
    rateFrom: 18.5,
  },
};

export const PRODUCT_CODES = Object.keys(PRODUCTS) as ProductCode[];

export const PURPOSE_LABEL: Record<LoanPurpose, string> = {
  STOCK: 'Закупка товара или сырья',
  CASH_GAP: 'Временная нехватка денег',
  EQUIPMENT: 'Покупка оборудования или транспорта',
  EXPANSION: 'Открытие новой точки, ремонт',
  CONTRACT: 'Исполнение контракта или тендера',
  REFINANCE: 'Погашение другого кредита',
  OTHER: 'Другое',
};

export const TAX_SYSTEM_LABEL: Record<TaxSystem, string> = {
  USN_INCOME: 'Упрощённая, «Доходы» (6 %)',
  USN_PROFIT: 'Упрощённая, «Доходы минус расходы» (15 %)',
  OSNO: 'Общая система',
  PSN: 'Патентная система',
  AUSN: 'Автоматизированная упрощённая (АУСН)',
};

/** Патент доступен только ИП. */
export const TAX_SYSTEMS_BY_FORM = {
  OOO: ['USN_INCOME', 'USN_PROFIT', 'OSNO', 'AUSN'],
  IP: ['USN_INCOME', 'USN_PROFIT', 'OSNO', 'PSN', 'AUSN'],
} as const satisfies Record<'OOO' | 'IP', readonly TaxSystem[]>;

export const COLLATERAL_LABEL: Record<CollateralType, string> = {
  NONE: 'Без залога',
  REAL_ESTATE: 'Недвижимость',
  VEHICLE: 'Транспорт',
  EQUIPMENT: 'Оборудование',
  GUARANTOR: 'Поручитель',
};

export const MARITAL_LABEL: Record<MaritalStatus, string> = {
  SINGLE: 'Не в браке',
  MARRIED: 'В браке',
};

export const LEGAL_FORM_LABEL = { OOO: 'ООО', IP: 'ИП' } as const;

/* ---------- Для рабочего места банка ---------- */

export const DECISION_LABEL: Record<DecisionKind, string> = {
  APPROVED: 'Одобрить',
  COUNTER_OFFER: 'Встречное предложение',
  REJECTED: 'Отказать',
};

export const DECISION_RESULT_LABEL: Record<DecisionKind, string> = {
  APPROVED: 'Одобрено',
  COUNTER_OFFER: 'Встречное предложение',
  REJECTED: 'Отказ',
};

export const DECISION_TONE: Record<DecisionKind, BadgeTone> = {
  APPROVED: 'success',
  COUNTER_OFFER: 'brand',
  REJECTED: 'danger',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
};

export const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

export const REJECT_REASON_LABEL: Record<RejectReasonCode, string> = {
  NO_HISTORY: 'Короткая история бизнеса / нет КИ',
  HIGH_DEBT_LOAD: 'Высокая долговая нагрузка',
  TAX_DEBT: 'Налоговая задолженность / блокировки',
  OVERDUE: 'Просрочки в кредитной истории',
  LOW_TURNOVER: 'Недостаточные обороты',
  OTHER: 'Иное (указать в комментарии)',
};

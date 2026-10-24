import type {
  ApplicationForm,
  ApplicationStatus,
  AuditEntry,
  BankDecision,
  Enrichment,
  Scoring,
  SigningDocument,
  StatusHistoryItem,
} from '@/entities/application';
import type { Product } from '@/entities/product';

/** Внутренние структуры мок-«бэкенда». Наружу (в UI) уходят только view-модели из engine/views.ts. */

export type ScheduledAction = 'VALIDATION' | 'ENRICHMENT' | 'SCORING' | 'ROUTE' | 'SIGNING' | 'DISBURSE';

export interface ScheduledStep {
  /** Unix-время, мс */
  at: number;
  action: ScheduledAction;
}

export interface StoredApplication {
  id: string;
  number: string;
  /** null — заявка синтетического заёмщика без логина (видна только банку). */
  userId: string | null;
  borrowerId: string;
  status: ApplicationStatus;
  createdAt: string;
  submittedAt: string;
  updatedAt: string;
  form: ApplicationForm;
  history: StatusHistoryItem[];
  /** Автоматические шаги конвейера, которые ещё впереди. */
  schedule: ScheduledStep[];
  enrichment: Enrichment | null;
  scoring: Scoring | null;
  decision: BankDecision | null;
  /** Объяснение встречного предложения простым языком. */
  clientExplanation: string | null;
  /** Подсказка клиенту при отказе: на какую сумму попробовать. */
  suggestedAmount: number | null;
  audit: AuditEntry[];
  signing: {
    documents: SigningDocument[];
    code: string | null;
    signedAt: string | null;
  } | null;
}

export interface StoredDraft {
  id: string;
  form: ApplicationForm;
  step: number;
  createdAt: string;
  updatedAt: string;
  prefilled: string[];
}

export interface MockDb {
  version: number;
  seededAt: string;
  /** Счётчик для номеров заявок. */
  sequence: number;
  applications: StoredApplication[];
  /** Черновики по userId (один на клиента). */
  drafts: Record<string, StoredDraft>;
  /** Продукты по userId. */
  products: Record<string, Product[]>;
}

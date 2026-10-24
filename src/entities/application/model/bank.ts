import type { LegalForm } from '@/entities/user';
import type { ApplicationStatus } from './status';
import type { ApplicationForm, DecisionKind, LoanTerms, ProductCode } from './types';

/** Типы рабочего места сотрудника. Здесь допустимы банковские термины. */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RejectReasonCode =
  | 'NO_HISTORY'
  | 'HIGH_DEBT_LOAD'
  | 'TAX_DEBT'
  | 'OVERDUE'
  | 'LOW_TURNOVER'
  | 'OTHER';

/* ---------- Обогащение (моки внешних источников) ---------- */

export interface RegistryData {
  source: 'ЕГРЮЛ' | 'ЕГРИП';
  status: 'ACTIVE' | 'LIQUIDATING';
  fullName: string;
  inn: string;
  ogrn: string;
  kpp: string | null;
  registeredAt: string;
  address: string;
  massAddress: boolean;
  director: string;
  founders: { name: string; share: number }[];
  okved: string;
  okvedName: string;
  /** Изменений в реестре за 12 мес. (смена руководителя, адреса и т.п.) */
  changesLast12m: number;
}

export interface CreditBureauData {
  source: string;
  hasHistory: boolean;
  /** Балл бюро (300–850) или null, если истории нет. */
  rating: number | null;
  activeLoans: number;
  closedLoans: number;
  totalDebt: number;
  monthlyPayments: number;
  maxOverdueDays: number;
  overduesLast12m: number;
  requestsLast30d: number;
}

export interface TaxData {
  source: string;
  debt: number;
  blockedAccounts: boolean;
  reportedRevenue: number;
  employeesReported: number;
}

export interface TurnoverMonth {
  /** "2026-09" */
  month: string;
  inflow: number;
  outflow: number;
}

export interface TurnoverData {
  source: string;
  months: TurnoverMonth[];
  avgInflow: number;
  /** Последние 3 месяца к предыдущим 3, % */
  trendPercent: number;
  /** Месяцы, когда расходы превысили поступления. */
  gapMonths: string[];
}

export type CheckLevel = 'ok' | 'warning' | 'critical';

export interface EnrichmentCheck {
  level: CheckLevel;
  text: string;
}

export interface Enrichment {
  fetchedAt: string;
  registry: RegistryData;
  creditBureau: CreditBureauData;
  tax: TaxData;
  turnover: TurnoverData;
  checks: EnrichmentCheck[];
}

/* ---------- Скоринг ---------- */

export interface ScoringFactor {
  code: string;
  label: string;
  /** Значение признака человеческим языком: "+12 % за 3 мес." */
  value: string;
  /** Вклад в балл: > 0 повышает, < 0 понижает. */
  impact: number;
}

export interface Recommendation {
  decision: DecisionKind;
  /** Условия для одобрения/встречного предложения. */
  terms: LoanTerms | null;
  rejectReason: RejectReasonCode | null;
  /** Почему система так решила — пункты для сотрудника. */
  rationale: string[];
  /** Максимальная посильная сумма при запрошенном сроке. */
  maxAffordableAmount: number;
  route: 'AUTO' | 'MANUAL';
  routeReason: string;
}

export interface Scoring {
  score: number;
  /** Вероятность дефолта, доля (0.031 = 3,1 %) */
  pd: number;
  riskLevel: RiskLevel;
  /** Уверенность модели, 0–1 */
  confidence: number;
  /** Ставка, рассчитанная для этого риска, % годовых — база для ручных условий. */
  ratePercent: number;
  modelVersion: string;
  calculatedAt: string;
  /** Отсортированы по модулю вклада. */
  factors: ScoringFactor[];
  recommendation: Recommendation;
}

/* ---------- Решение и аудит ---------- */

export type ActorType = 'client' | 'system' | 'officer';

export interface Actor {
  type: ActorType;
  name: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: Actor;
  /** Этап, на котором произошло событие. */
  stage: ApplicationStatus;
  action: string;
  comment?: string;
}

export interface BankDecision {
  decision: DecisionKind;
  terms: LoanTerms | null;
  rejectReason: RejectReasonCode | null;
  recommended: DecisionKind | null;
  /** Решение отличается от рекомендации системы (вид или условия). */
  isOverride: boolean;
  comment: string;
  decidedBy: Actor;
  decidedAt: string;
}

export interface BankApplication {
  id: string;
  number: string;
  status: ApplicationStatus;
  product: ProductCode;
  createdAt: string;
  submittedAt: string;
  updatedAt: string;
  form: ApplicationForm;
  enrichment: Enrichment | null;
  scoring: Scoring | null;
  decision: BankDecision | null;
  audit: AuditEntry[];
}

/* ---------- Очередь ---------- */

export interface BankQueueItem {
  id: string;
  number: string;
  status: ApplicationStatus;
  companyName: string;
  inn: string;
  legalForm: LegalForm;
  product: ProductCode;
  amount: number;
  termMonths: number;
  submittedAt: string;
  updatedAt: string;
  score: number | null;
  riskLevel: RiskLevel | null;
  recommendation: DecisionKind | null;
}

/** Группы статусов для фильтра очереди. */
export type QueueStatusFilter = 'ALL' | 'ACTION' | 'PIPELINE' | 'DECIDED' | 'CLOSED';

export interface BankQueueFilters {
  status: QueueStatusFilter;
  risk: RiskLevel[];
  minAmount: number | null;
  maxAmount: number | null;
  q: string;
  sort: string;
}

export interface BankQueueResponse {
  items: BankQueueItem[];
  total: number;
  counters: {
    awaitingDecision: number;
    inPipeline: number;
    decidedToday: number;
    overrideRate: number;
  };
}

export interface BankDecisionRequest {
  decision: DecisionKind;
  /** Для одобрения и встречного предложения. */
  terms?: LoanTerms;
  rejectReason?: RejectReasonCode;
  /** Обязателен при ручном изменении рекомендации. */
  comment: string;
}

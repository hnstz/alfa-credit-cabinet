import type {
  ApplicationForm,
  Enrichment,
  LoanPurpose,
  LoanTerms,
  ProductCode,
  RejectReasonCode,
  RiskLevel,
  Scoring,
  ScoringFactor,
} from '@/entities/application';
import { config } from '@/shared/config';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { BorrowerProfile } from '../fixtures/borrowers';
import type { StoredApplication } from '../types';
import { AUTO_DECISION_LIMIT, businessAgeMonths } from './scoring';

/**
 * Адаптер к ML-сервису (каталог ml/, FastAPI).
 *
 *   заявка + обогащение ──► buildMlApplication() ──► POST /score + POST /decision
 *                                                         │
 *   Scoring (как у локального скоринга) ◄── mapMlToScoring()
 *
 * Модель отвечает за риск (PD, грейд, факторы SHAP) и условия кредита (правила ML: PTI, лимиты продуктов, запреты).
 * Маршрутизация «авто / сотрудник» остаётся на стороне конвейера: она зависит от суммы и полноты данных.
 */

const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_KEY = 'alfa-credit:ml-scoring';

/* =========================================================
   Контракт ML (personal_predlozhenie/schemas.py)
   ========================================================= */

interface MlApplication {
  features: {
    inn: string;
    full_name: string;
    org_form: 'ООО' | 'ИП';
    sector: string;
    years_in_business: number;
    employees: number;
    annual_revenue: number;
    avg_monthly_turnover: number;
    net_profit_margin: number;
    expense_ratio: number;
    cash_gap_flag: boolean;
    tax_debt: number;
    turnover_trend_3m_pct: number;
    active_loans: number;
    existing_monthly_debt: number;
    bkii_score: number;
    overdue_30d_max_days: number;
    overdue_90d_count: number;
    applicant_age: number;
    has_collateral: boolean;
    region: string;
  };
  ban: { source: 'none' | 'self' | 'bank' | 'bailiff'; since: string | null; note: string };
  requested_amount: number;
  requested_term: number;
  loan_purpose: string;
  preferred_product: string | null;
}

interface MlFactor {
  feature: string;
  label: string;
  value: number;
  shap: number;
  direction: 'risk_up' | 'risk_down' | string;
  text: string;
}

interface MlScoreResponse {
  pd: number;
  risk_grade: 'A' | 'B' | 'C' | 'D';
  model_version: string;
  is_banned: boolean;
  top_factors: MlFactor[];
}

interface MlDecisionResponse {
  outcome: 'approve' | 'counter' | 'reject';
  risk_grade: 'A' | 'B' | 'C' | 'D';
  pd: number;
  is_banned: boolean;
  terms: { amount: number; term_months: number; rate: number; monthly_payment: number; pti: number } | null;
  reasons: string[];
  reject_codes: string[];
  top_factors: MlFactor[];
}

/* =========================================================
   Справочники: наша анкета → словарь ML
   ========================================================= */

/** Первые две цифры ОКВЭД → отрасль из обучающей выборки (то же соответствие, что в ml/app/frontend_contract.py). */
const OKVED_SECTOR: Record<string, string> = {
  '01': 'Сельское хозяйство', '02': 'Сельское хозяйство', '03': 'Сельское хозяйство',
  '10': 'Производство', '20': 'Производство', '25': 'Производство', '33': 'Производство',
  '41': 'Строительство', '42': 'Строительство', '43': 'Строительство',
  '45': 'Розничная торговля', '46': 'Розничная торговля', '47': 'Розничная торговля',
  '49': 'Грузоперевозки', '52': 'Грузоперевозки', '53': 'Грузоперевозки',
  '55': 'Общепит', '56': 'Общепит',
  '62': 'IT и услуги', '63': 'IT и услуги',
  '86': 'Медицина', '87': 'Медицина', '88': 'Медицина',
  '96': 'Красота и сервис',
};

const PURPOSE: Record<LoanPurpose, string> = {
  STOCK: 'пополнение оборотных средств',
  CASH_GAP: 'кассовый разрыв',
  EQUIPMENT: 'оборудование/развитие',
  EXPANSION: 'оборудование/развитие',
  CONTRACT: 'регулируемые закупки',
  REFINANCE: 'снижение нагрузки по долгам',
  OTHER: 'пополнение оборотных средств',
};

/** Коды продуктов ML (personal_predlozhenie/config.py: PRODUCTS). */
const PRODUCT: Record<ProductCode, string> = {
  WORKING_CAPITAL: 'WORKING',
  INVESTMENT: 'INVEST',
  EQUIPMENT: 'LEASING',
  CREDIT_LINE: 'CREDIT_LINE',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, digits = 0) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/* =========================================================
   Запрос
   ========================================================= */

export interface MlScoringInput {
  form: ApplicationForm;
  enrichment: Enrichment;
  profile: BorrowerProfile;
  now: number;
}

/** Данные, которыми оперируют и запрос, и расчёт уверенности. */
function financials({ form, enrichment }: MlScoringInput) {
  const { turnover, creditBureau: bki } = enrichment;
  // Выручку берём из анкеты, но не выше подтверждённой оборотами по счёту (как в локальном скоринге)
  const declared = form.finance.monthlyRevenue ?? 0;
  const revenue = turnover.avgInflow > 0 ? Math.min(declared, turnover.avgInflow * 1.1) : declared;
  const expenses = form.finance.monthlyExpenses ?? 0;
  const existingDebt = Math.max(form.finance.hasOtherLoans ? (form.finance.otherLoansPayment ?? 0) : 0, bki.monthlyPayments);
  return { revenue, expenses, existingDebt };
}

export function buildMlApplication(input: MlScoringInput): MlApplication {
  const { form, enrichment, profile, now } = input;
  const { turnover, creditBureau: bki, tax } = enrichment;
  const { revenue, expenses, existingDebt } = financials(input);
  const c = profile.company;
  const ageMonths = businessAgeMonths(form.company.registeredAt || c.registeredAt, now);
  const okved = form.company.okved || c.okved;

  const blocked = tax.blockedAccounts;

  return {
    features: {
      inn: form.company.inn || c.inn,
      full_name: form.company.name || c.name,
      org_form: (form.company.legalForm || c.legalForm) === 'IP' ? 'ИП' : 'ООО',
      sector: OKVED_SECTOR[okved.trim().slice(0, 2)] ?? 'Розничная торговля',
      years_in_business: round(Math.max(ageMonths, 0) / 12, 2),
      employees: form.company.employees ?? c.employees,
      annual_revenue: c.annualRevenue,
      avg_monthly_turnover: Math.round(revenue),
      net_profit_margin: revenue > 0 ? round(clamp((revenue - expenses) / revenue, -1, 1), 3) : 0,
      expense_ratio: revenue > 0 ? round(clamp(expenses / revenue, 0, 1), 3) : 1,
      cash_gap_flag: turnover.gapMonths.length >= 2,
      tax_debt: tax.debt,
      turnover_trend_3m_pct: turnover.trendPercent,
      active_loans: bki.activeLoans,
      existing_monthly_debt: Math.round(existingDebt),
      // Нет истории — нейтральные 700, как в контракте баннера (ml/app/frontend_contract.py)
      bkii_score: clamp(bki.rating ?? 700, 300, 999),
      overdue_30d_max_days: bki.maxOverdueDays,
      overdue_90d_count: bki.overduesLast12m,
      // Возраст заявителя в анкете не спрашиваем — значение по умолчанию из контракта ML
      applicant_age: 38,
      has_collateral: form.finance.collateral !== 'NONE',
      region: form.company.region || c.region,
    },
    // Блокировка счетов по решению ФНС — это жёсткий запрет: ML отказывает без обращения к модели
    ban: blocked
      ? { source: 'bailiff', since: null, note: 'Приостановлены операции по счетам (решение ФНС)' }
      : { source: 'none', since: null, note: '' },
    requested_amount: form.loan.amount ?? 0,
    requested_term: form.loan.termMonths ?? 12,
    loan_purpose: PURPOSE[(form.loan.purpose || 'OTHER') as LoanPurpose],
    preferred_product: form.loan.product ? PRODUCT[form.loan.product] : null,
  };
}

/* =========================================================
   Ответ → Scoring
   ========================================================= */

/**
 * Балл 300–900 — перевод PD в привычную шкалу фронта: обратная функция к формуле PD в локальном скоринге
 * (pd = 1 / (1 + exp((score − 480) / 55))). Само число модель не отдаёт.
 */
export function pdToScore(pd: number): number {
  const p = clamp(pd, 0.0001, 0.9999);
  return Math.round(clamp(480 + 55 * Math.log((1 - p) / p), 300, 900));
}

const RISK_BY_GRADE: Record<MlScoreResponse['risk_grade'], RiskLevel> = { A: 'LOW', B: 'LOW', C: 'MEDIUM', D: 'HIGH' };

/** Признак модели → группа причины отказа в нашем справочнике. */
function reasonFromFeature(feature: string): RejectReasonCode {
  switch (feature) {
    case 'bkii_score':
    case 'overdue_30d_max_days':
    case 'overdue_90d_count':
      return 'OVERDUE';
    case 'years_in_business':
      return 'NO_HISTORY';
    case 'pti_current':
    case 'existing_monthly_debt':
    case 'active_loans':
    case 'loan_to_turnover':
      return 'HIGH_DEBT_LOAD';
    case 'avg_monthly_turnover':
    case 'annual_revenue':
    case 'cash_gap_flag':
    case 'expense_ratio':
    case 'net_profit_margin':
      return 'LOW_TURNOVER';
    default:
      return 'OTHER';
  }
}

function rejectReason(decision: MlDecisionResponse, taxDebt: number, hasHistory: boolean): RejectReasonCode {
  const codes = decision.reject_codes;
  if (codes.some((c) => c.startsWith('CREDIT_BAN'))) return taxDebt > 0 ? 'TAX_DEBT' : 'OTHER';
  if (codes.includes('COLD_START')) return 'NO_HISTORY';
  if (codes.includes('PTI_UNAFFORDABLE')) return 'HIGH_DEBT_LOAD';
  const worst = decision.top_factors.filter((f) => f.direction === 'risk_up').sort((a, b) => b.shap - a.shap)[0];
  const byFactor = worst ? reasonFromFeature(worst.feature) : 'OTHER';
  return byFactor === 'OVERDUE' && !hasHistory ? 'NO_HISTORY' : byFactor;
}

function mapFactors(factors: MlFactor[]): ScoringFactor[] {
  return factors
    .map((f) => ({
      code: f.feature.toUpperCase(),
      label: f.label,
      value: f.text,
      // SHAP в log-odds дефолта (+ растит риск) → баллы шкалы: 1 log-odds ≈ 55 баллов, знак обратный
      impact: Math.round(-f.shap * 55),
    }))
    .filter((f) => f.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

/**
 * Уверенность 0–1. Модель сама её не отдаёт, поэтому берём меньшее из двух:
 * доля «хороших» исходов (1 − PD, как в ml/app/frontend_contract.py) и полнота данных (месяцы оборота, наличие истории в БКИ).
 */
function confidenceOf(pd: number, input: MlScoringInput): number {
  const activeMonths = input.enrichment.turnover.months.filter((m) => m.inflow > 0).length;
  const dataCompleteness = 0.6 + 0.35 * Math.min(1, activeMonths / 12) - (input.enrichment.creditBureau.hasHistory ? 0 : 0.1);
  return round(Math.min(clamp(1 - pd, 0.05, 0.99), Math.min(0.99, dataCompleteness)), 2);
}

export function mapMlToScoring(score: MlScoreResponse, decision: MlDecisionResponse, input: MlScoringInput): Scoring {
  const { form, enrichment, now } = input;
  const { creditBureau: bki, tax } = enrichment;
  const pd = round(decision.pd, 4);
  const confidence = confidenceOf(pd, input);
  const amount = form.loan.amount ?? 0;

  const terms: LoanTerms | null = decision.terms
    ? {
        amount: decision.terms.amount,
        termMonths: decision.terms.term_months,
        ratePercent: decision.terms.rate,
        monthlyPayment: decision.terms.monthly_payment,
      }
    : null;
  const kind = decision.outcome === 'approve' ? 'APPROVED' : decision.outcome === 'counter' ? 'COUNTER_OFFER' : 'REJECTED';

  const criticalChecks = enrichment.checks.filter((c) => c.level === 'critical').length;
  const route = amount <= AUTO_DECISION_LIMIT && confidence >= 0.7 && criticalChecks === 0 ? 'AUTO' : 'MANUAL';
  const routeReason =
    route === 'AUTO'
      ? `Сумма до ${formatMoney(AUTO_DECISION_LIMIT)}, уверенность модели ${Math.round(confidence * 100)} % — решение автоматически`
      : amount > AUTO_DECISION_LIMIT
        ? `Сумма выше порога авторешения ${formatMoney(AUTO_DECISION_LIMIT)} — нужен сотрудник`
        : criticalChecks > 0
          ? 'Есть критичные стоп-факторы — нужен сотрудник'
          : 'Низкая уверенность модели — нужен сотрудник';

  const rationale = [...decision.reasons];
  if (terms && decision.terms) {
    rationale.push(`Нагрузка после выдачи (PTI): ${formatPercent(decision.terms.pti * 100, 0)} дохода`);
  }
  if (tax.debt > 0 && kind !== 'REJECTED') rationale.push(`Учтена задолженность перед ФНС: ${formatMoney(tax.debt)}`);

  return {
    score: pdToScore(pd),
    pd,
    riskLevel: RISK_BY_GRADE[score.risk_grade],
    confidence,
    ratePercent: terms?.ratePercent ?? 0,
    modelVersion: score.model_version,
    calculatedAt: new Date(now).toISOString(),
    factors: mapFactors(score.top_factors.length ? score.top_factors : decision.top_factors),
    recommendation: {
      decision: kind,
      terms,
      rejectReason: kind === 'REJECTED' ? rejectReason(decision, tax.debt, bki.hasHistory) : null,
      rationale,
      // ML не отдаёт «посильную сумму» отдельно: при одобрении/встречном это сумма условий, при отказе — 0
      maxAffordableAmount: terms?.amount ?? 0,
      route,
      routeReason,
    },
  };
}

/* =========================================================
   Транспорт
   ========================================================= */

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.mlApiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ML ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Один вызов конвейера: скоринг (PD, факторы, версия модели) и решение (условия, причины) считаются параллельно. */
export async function requestMlScoring(input: MlScoringInput): Promise<Scoring> {
  const body = buildMlApplication(input);
  const [score, decision] = await Promise.all([post<MlScoreResponse>('/score', body), post<MlDecisionResponse>('/decision', body)]);
  return mapMlToScoring(score, decision, input);
}

/* =========================================================
   Результаты между тиками конвейера
   =========================================================
   Конвейер мок-сервера синхронный (withDb), а запрос к ML — асинхронный. Поэтому шаг ROUTE не выполняется,
   пока ответа нет: запрос стартует, шаг остаётся в расписании, результат кладётся в localStorage,
   и следующий опрос статуса (1,5 с у клиента) подхватывает его. Если ML не ответил — шаг пойдёт на локальном скоринге. */

type CacheEntry = { ok: true; scoring: Scoring } | { ok: false };

const inflight = new Set<string>();

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function writeCache(appId: string, entry: CacheEntry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [appId]: entry }));
  } catch {
    /* хранилище недоступно — вторая попытка при следующем тике */
  }
}

export function clearMlScoringCache() {
  inflight.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* нечего чистить */
  }
}

export const mlScoringEnabled = () => config.mlApiUrl !== '';

/**
 * Scoring от ML для заявки, 'pending' — ответ ещё в пути, null — ML недоступен (нужен локальный скоринг).
 */
export function resolveMlScoring(app: StoredApplication, input: MlScoringInput): Scoring | 'pending' | null {
  const cached = readCache()[app.id];
  if (cached) return cached.ok ? cached.scoring : null;
  if (inflight.has(app.id)) return 'pending';

  inflight.add(app.id);
  requestMlScoring(input)
    .then((scoring) => writeCache(app.id, { ok: true, scoring }))
    .catch((e: unknown) => {
      console.warn('[scoring] ML недоступен, используем локальный скоринг:', e);
      writeCache(app.id, { ok: false });
    })
    .finally(() => inflight.delete(app.id));
  return 'pending';
}

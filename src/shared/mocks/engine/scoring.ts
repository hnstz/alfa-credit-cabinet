import { PRODUCTS, RISK_LABEL } from '@/entities/application';
import type {
  ApplicationForm,
  Enrichment,
  EnrichmentCheck,
  LoanTerms,
  ProductCode,
  Recommendation,
  RejectReasonCode,
  RiskLevel,
  Scoring,
  ScoringFactor,
} from '@/entities/application';
import { annuityPayment, maxPrincipal } from '@/shared/lib/finance';
import { formatMoney, formatMonths, formatPercent, plural } from '@/shared/lib/format';
import type { BorrowerProfile } from '../fixtures/borrowers';

/**
 * Мок ML-скоринга. Логика детерминирована и объяснима:
 * балл = база + сумма вкладов признаков (как SHAP-значения у реальной модели).
 * Сумму и срок определяет отдельная проверка посильности платежа.
 */

export const MODEL_VERSION = 'smb-score 2.4 (демо)';
/** Заявки до этой суммы с уверенной оценкой решаются без сотрудника. */
export const AUTO_DECISION_LIMIT = 1_000_000;

const BASE_SCORE = 640;
const TERM_STEPS = [6, 12, 18, 24, 36, 48, 60];

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const round1 = (v: number) => Math.round(v * 10) / 10;
const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

/** Ключи 12 полных месяцев перед текущим: ['2025-10', …, '2026-09']. */
export function lastMonthKeys(now: number, count = 12): string[] {
  const d = new Date(now);
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - count + i, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function businessAgeMonths(registeredAt: string, now: number): number {
  const from = new Date(registeredAt);
  const to = new Date(now);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/* =========================================================
   Обогащение: «ответы» ЕГРЮЛ/ЕГРИП, БКИ, ФНС и обороты по счёту
   ========================================================= */

export function computeEnrichment(
  profile: BorrowerProfile,
  form: ApplicationForm,
  now: number,
): Enrichment {
  const c = profile.company;
  const months = lastMonthKeys(now).map((month, i) => ({
    month,
    inflow: profile.inflow[i] ?? 0,
    outflow: profile.outflow[i] ?? 0,
  }));
  const active = months.filter((m) => m.inflow > 0);
  const recent = active.slice(-6);
  const avgInflow = recent.length ? Math.round(sum(recent.map((m) => m.inflow)) / recent.length) : 0;
  const last3 = sum(months.slice(-3).map((m) => m.inflow));
  const prior3 = sum(months.slice(-6, -3).map((m) => m.inflow));
  const trendPercent = prior3 > 0 ? round1((last3 / prior3 - 1) * 100) : 0;
  const gapMonths = active.filter((m) => m.outflow > m.inflow).map((m) => m.month);
  const ageMonths = businessAgeMonths(c.registeredAt, now);

  const checks: EnrichmentCheck[] = [];
  checks.push({ level: 'ok', text: 'Компания действует: ликвидации и банкротства нет' });
  if (profile.massAddress) {
    checks.push({ level: 'warning', text: 'Массовый адрес регистрации (более 10 компаний по адресу)' });
  }
  if (profile.registryChanges12m >= 2) {
    checks.push({ level: 'warning', text: `Частые изменения в реестре: ${profile.registryChanges12m} за 12 мес.` });
  }
  if (ageMonths < 12) {
    checks.push({ level: 'warning', text: `Бизнес зарегистрирован ${ageMonths} мес. назад` });
  }
  if (profile.tax.debt > 0) {
    checks.push({ level: 'critical', text: `Задолженность перед ФНС: ${formatMoney(profile.tax.debt)}` });
  }
  if (profile.tax.blockedAccounts) {
    checks.push({ level: 'critical', text: 'Приостановлены операции по счетам (решение ФНС)' });
  }
  if (profile.tax.debt === 0 && !profile.tax.blockedAccounts) {
    checks.push({ level: 'ok', text: 'Налоговой задолженности и блокировок нет' });
  }
  if (!profile.bki.hasHistory) {
    checks.push({ level: 'warning', text: 'Кредитной истории нет' });
  } else if (profile.bki.maxOverdueDays > 30) {
    checks.push({ level: 'critical', text: `Просрочка более 30 дней (до ${profile.bki.maxOverdueDays} дн.)` });
  } else if (profile.bki.maxOverdueDays > 0) {
    checks.push({ level: 'warning', text: `Незначительные просрочки: до ${profile.bki.maxOverdueDays} дн. за 12 мес.` });
  } else {
    checks.push({ level: 'ok', text: 'Просрочек по кредитам нет' });
  }
  if (profile.bki.requestsLast30d >= 4) {
    checks.push({
      level: 'warning',
      text: `${profile.bki.requestsLast30d} запросов КИ за 30 дней — клиент активно ищет финансирование`,
    });
  }
  if (gapMonths.length >= 3) {
    checks.push({ level: 'warning', text: `Кассовые разрывы: ${gapMonths.length} мес. за год` });
  }

  const declared = form.finance.monthlyRevenue ?? 0;
  if (avgInflow > 0 && declared > avgInflow * 1.25) {
    checks.push({
      level: 'warning',
      text: `Выручка в анкете (${formatMoney(declared)}) выше оборотов по счёту (${formatMoney(avgInflow)}) на ${Math.round((declared / avgInflow - 1) * 100)} % — в расчёте используем данные счёта`,
    });
  } else if (avgInflow > 0) {
    checks.push({ level: 'ok', text: 'Выручка в анкете подтверждается оборотами по счёту' });
  }

  return {
    fetchedAt: new Date(now).toISOString(),
    registry: {
      source: c.legalForm === 'IP' ? 'ЕГРИП' : 'ЕГРЮЛ',
      status: 'ACTIVE',
      fullName: c.name,
      inn: c.inn,
      ogrn: c.ogrn,
      kpp: profile.kpp,
      registeredAt: c.registeredAt,
      address: profile.address,
      massAddress: profile.massAddress,
      director: profile.director,
      founders: profile.founders,
      okved: c.okved,
      okvedName: c.okvedName,
      changesLast12m: profile.registryChanges12m,
    },
    creditBureau: { source: 'НБКИ (мок)', ...profile.bki },
    tax: {
      source: 'ФНС (мок)',
      debt: profile.tax.debt,
      blockedAccounts: profile.tax.blockedAccounts,
      reportedRevenue: c.annualRevenue,
      employeesReported: c.employees,
    },
    turnover: { source: 'Расчётный счёт в банке', months, avgInflow, trendPercent, gapMonths },
    checks,
  };
}

/* =========================================================
   Скоринг
   ========================================================= */

interface ScoringContext {
  form: ApplicationForm;
  enrichment: Enrichment;
  profile: BorrowerProfile;
  now: number;
}

function buildFactors({ form, enrichment, profile, now }: ScoringContext, netFlow: number, existing: number) {
  const { turnover, creditBureau: bki, tax } = enrichment;
  const factors: ScoringFactor[] = [];
  const add = (code: string, label: string, value: string, impact: number) => {
    if (impact !== 0) factors.push({ code, label, value, impact });
  };

  const t = turnover.trendPercent;
  add(
    'TURNOVER_TREND',
    'Динамика оборотов',
    `${t > 0 ? '+' : ''}${formatPercent(t)} за 3 мес.`,
    t >= 10 ? 45 : t >= 0 ? 20 : t >= -10 ? -10 : -45,
  );

  const gaps = turnover.gapMonths.length;
  add(
    'STABILITY',
    'Стабильность поступлений',
    gaps === 0 ? 'Без кассовых разрывов' : `${gaps} ${plural(gaps, ['месяц', 'месяца', 'месяцев'])} в минусе`,
    gaps === 0 ? 30 : gaps <= 2 ? -15 : -55,
  );

  add(
    'CREDIT_HISTORY',
    'Кредитная история (БКИ)',
    !bki.hasHistory
      ? 'Нет истории'
      : bki.maxOverdueDays > 0
        ? `Просрочка до ${bki.maxOverdueDays} дн.`
        : `Без просрочек, ${bki.closedLoans} закрытых`,
    !bki.hasHistory ? -45 : bki.maxOverdueDays > 30 ? -110 : bki.maxOverdueDays > 0 ? -35 : 55,
  );

  const age = businessAgeMonths(form.company.registeredAt || profile.company.registeredAt, now);
  add(
    'BUSINESS_AGE',
    'Срок работы бизнеса',
    age < 12 ? `${age} мес.` : `${Math.floor(age / 12)} ${plural(Math.floor(age / 12), ['год', 'года', 'лет'])}`,
    age < 12 ? -70 : age <= 36 ? 5 : 40,
  );

  const load = netFlow > 0 ? existing / netFlow : existing > 0 ? Infinity : 0;
  add(
    'DEBT_LOAD',
    'Текущая кредитная нагрузка',
    existing === 0 ? 'Нет других кредитов' : `${Math.round(Math.min(load, 9.99) * 100)} % чистого потока`,
    existing === 0 ? 20 : load <= 0.2 ? 10 : load <= 0.4 ? -25 : -70,
  );

  add(
    'TAX',
    'Налоги и блокировки',
    tax.debt > 0 ? `Долг ${formatMoney(tax.debt)}` : 'Без долгов',
    tax.debt > 0 || tax.blockedAccounts ? -80 : 15,
  );

  add(
    'INDUSTRY',
    'Отраслевой риск',
    `${RISK_LABEL[profile.industryRisk]} · ОКВЭД ${profile.company.okved}`,
    profile.industryRisk === 'LOW' ? 10 : profile.industryRisk === 'HIGH' ? -25 : 0,
  );

  add('COLLATERAL', 'Обеспечение', form.finance.collateral === 'NONE' ? 'Нет' : 'Есть залог', form.finance.collateral === 'NONE' ? 0 : 25);

  add(
    'CREDIT_REQUESTS',
    'Запросы КИ за 30 дней',
    String(bki.requestsLast30d),
    bki.requestsLast30d >= 4 ? -30 : 0,
  );

  return factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

function reasonFromFactor(factor: ScoringFactor | undefined, hasHistory: boolean): RejectReasonCode {
  switch (factor?.code) {
    case 'TAX':
      return 'TAX_DEBT';
    case 'CREDIT_HISTORY':
      return hasHistory ? 'OVERDUE' : 'NO_HISTORY';
    case 'BUSINESS_AGE':
      return 'NO_HISTORY';
    case 'DEBT_LOAD':
      return 'HIGH_DEBT_LOAD';
    case 'TURNOVER_TREND':
    case 'STABILITY':
      return 'LOW_TURNOVER';
    default:
      return 'OTHER';
  }
}

function terms(amount: number, termMonths: number, ratePercent: number): LoanTerms {
  return { amount, termMonths, ratePercent, monthlyPayment: annuityPayment(amount, ratePercent, termMonths) };
}

export function computeScoring(ctx: ScoringContext): Scoring {
  const { form, enrichment, now } = ctx;
  const { turnover, creditBureau: bki, tax } = enrichment;

  // Выручку берём из анкеты, но не выше подтверждённой оборотами по счёту
  const declared = form.finance.monthlyRevenue ?? 0;
  const revenue = turnover.avgInflow > 0 ? Math.min(declared, turnover.avgInflow * 1.1) : declared;
  const netFlow = Math.max(0, revenue - (form.finance.monthlyExpenses ?? 0));
  const existing = Math.max(
    form.finance.hasOtherLoans ? (form.finance.otherLoansPayment ?? 0) : 0,
    bki.monthlyPayments,
  );

  const factors = buildFactors(ctx, netFlow, existing);
  const score = Math.max(300, Math.min(900, BASE_SCORE + sum(factors.map((f) => f.impact))));
  const pd = 1 / (1 + Math.exp((score - 480) / 55));
  const riskLevel: RiskLevel = score >= 700 ? 'LOW' : score >= 600 ? 'MEDIUM' : 'HIGH';
  const ratePercent = round1(16.5 + Math.max(0, 760 - score) * 0.04 + (form.finance.collateral === 'NONE' ? 1 : 0));
  const activeMonths = turnover.months.filter((m) => m.inflow > 0).length;
  const confidence =
    Math.round(Math.min(0.99, 0.6 + 0.35 * Math.min(1, activeMonths / 12) - (bki.hasHistory ? 0 : 0.1)) * 100) / 100;

  // --- посильность платежа ---
  const amount = form.loan.amount ?? 0;
  const term = form.loan.termMonths ?? 12;
  const product = (form.loan.product || 'WORKING_CAPITAL') as ProductCode;
  const maxTerm = Math.max(...PRODUCTS[product].terms);
  const capShare = score >= 700 ? 0.6 : 0.45;
  const maxPayment = Math.max(0, capShare * netFlow - existing);
  const riskCap = turnover.avgInflow * (score >= 700 ? 6 : score >= 600 ? 3 : 1.5);
  const limitFor = (months: number) => Math.min(maxPrincipal(maxPayment, ratePercent, months), riskCap);
  const maxAffordableAmount = floorTo(limitFor(term), 50_000);
  const requestedPayment = annuityPayment(amount, ratePercent, term);

  const criticalChecks = enrichment.checks.filter((c) => c.level === 'critical').length;
  const route: Recommendation['route'] =
    amount <= AUTO_DECISION_LIMIT && confidence >= 0.7 && criticalChecks === 0 ? 'AUTO' : 'MANUAL';
  const routeReason =
    route === 'AUTO'
      ? `Сумма до ${formatMoney(AUTO_DECISION_LIMIT)}, уверенность модели ${Math.round(confidence * 100)} % — решение автоматически`
      : amount > AUTO_DECISION_LIMIT
        ? `Сумма выше порога авторешения ${formatMoney(AUTO_DECISION_LIMIT)} — нужен сотрудник`
        : criticalChecks > 0
          ? 'Есть критичные стоп-факторы — нужен сотрудник'
          : 'Низкая уверенность модели — нужен сотрудник';

  const rationale = [
    `Чистый денежный поток ≈ ${formatMoney(Math.round(netFlow))}/мес., платежи по другим кредитам ${formatMoney(existing)}/мес.`,
    `Посильный новый платёж — до ${formatMoney(Math.round(maxPayment))}/мес. (${Math.round(capShare * 100)} % потока с учётом текущих кредитов)`,
    `Лимит по оборотам: ${formatMoney(floorTo(riskCap, 10_000))} (${score >= 700 ? 6 : score >= 600 ? 3 : 1.5} × среднемесячные поступления)`,
  ];

  const base = { maxAffordableAmount, route, routeReason };
  const negative = factors.filter((f) => f.impact < 0).sort((a, b) => a.impact - b.impact);

  const reject = (code: RejectReasonCode, text: string): Recommendation => ({
    ...base,
    decision: 'REJECTED',
    terms: null,
    rejectReason: code,
    rationale: [text, ...rationale],
  });

  let recommendation: Recommendation;
  if (tax.debt > 0 && tax.blockedAccounts) {
    recommendation = reject('TAX_DEBT', 'Стоп-фактор: налоговая задолженность и блокировка счетов');
  } else if (bki.maxOverdueDays > 60) {
    recommendation = reject('OVERDUE', 'Стоп-фактор: просрочка более 60 дней');
  } else if (score < 520) {
    recommendation = reject(reasonFromFactor(negative[0], bki.hasHistory), `Балл ${score} ниже порога отсечения 520`);
  } else if (maxPayment === 0) {
    recommendation = reject('HIGH_DEBT_LOAD', 'Текущие платежи уже съедают допустимую долю потока');
  } else if (amount <= limitFor(term)) {
    recommendation = {
      ...base,
      decision: 'APPROVED',
      terms: terms(amount, term, ratePercent),
      rejectReason: null,
      rationale: [
        `Запрошенный платёж ${formatMoney(requestedPayment)}/мес. укладывается в посильный`,
        ...rationale,
      ],
    };
  } else {
    const longer = TERM_STEPS.filter((t) => t > term && t <= Math.min(term + 12, maxTerm));
    const sameAmountTerm = longer.find((t) => amount <= limitFor(t));
    if (sameAmountTerm) {
      recommendation = {
        ...base,
        decision: 'COUNTER_OFFER',
        terms: terms(amount, sameAmountTerm, ratePercent),
        rejectReason: null,
        rationale: [
          `Платёж ${formatMoney(requestedPayment)}/мес. выше посильного; при сроке ${formatMonths(sameAmountTerm)} укладывается`,
          ...rationale,
        ],
      };
    } else {
      const bestTerm = longer.at(-1) ?? term;
      const offerAmount = floorTo(limitFor(bestTerm), 50_000);
      if (offerAmount >= Math.max(300_000, amount * 0.4)) {
        recommendation = {
          ...base,
          decision: 'COUNTER_OFFER',
          terms: terms(offerAmount, bestTerm, ratePercent),
          rejectReason: null,
          rationale: [
            `Запрошенная сумма выше посильной: предлагаем ${formatMoney(offerAmount)} на ${formatMonths(bestTerm)}`,
            ...rationale,
          ],
        };
      } else {
        recommendation = reject(
          reasonFromFactor(negative[0], bki.hasHistory),
          `Посильная сумма ${formatMoney(offerAmount)} — меньше 40 % запрошенной`,
        );
      }
    }
  }

  return {
    score,
    pd: Math.round(pd * 10_000) / 10_000,
    riskLevel,
    confidence,
    ratePercent,
    modelVersion: MODEL_VERSION,
    calculatedAt: new Date(now).toISOString(),
    factors,
    recommendation,
  };
}

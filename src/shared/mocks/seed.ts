import type {
  Actor,
  BankDecisionRequest,
  FinanceSection,
  LoanSection,
} from '@/entities/application';
import type { LoanProduct } from '@/entities/product';
import { BORROWERS } from './fixtures/borrowers';
import { buildPrefilledForm, prefilledFields } from './engine/forms';
import {
  acceptOffer,
  advance,
  applyDecision,
  createApplication,
  declineOffer,
  PIPELINE_TIMINGS,
  requestSignCode,
  signDocuments,
} from './engine/pipeline';
import type { PipelineHooks } from './engine/pipeline';
import type { MockDb, StoredApplication } from './types';

/**
 * Стартовое состояние демо: у каждого клиента — своя история,
 * в очереди банка — заявки во всех состояниях (включая идущие прямо сейчас).
 */

export const DB_VERSION = 3;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const OFFICER: Actor = { type: 'officer', name: 'Мария Иванова' };
const OFFICER_2: Actor = { type: 'officer', name: 'Алексей Громов' };

type SeedDecision =
  | { after: number; mode: 'agree'; comment?: string; by?: Actor }
  | { after: number; mode: 'override'; request: BankDecisionRequest; by?: Actor };

type SeedResponse =
  | { type: 'accept'; after: number; signAfter?: number }
  | { type: 'decline'; after: number; reason: string };

interface SeedSpec {
  borrowerId: string;
  userId?: string;
  loan: Pick<LoanSection, 'product' | 'amount' | 'termMonths' | 'purpose'>;
  finance?: Partial<FinanceSection>;
  submittedAgo: number;
  timings?: Partial<typeof PIPELINE_TIMINGS>;
  decision?: SeedDecision;
  response?: SeedResponse;
}

const SEEDS: SeedSpec[] = [
  // --- Демо-клиенты ---
  {
    borrowerId: 'c-romashka',
    userId: 'u-romashka',
    loan: { product: 'WORKING_CAPITAL', amount: 5_000_000, termMonths: 24, purpose: 'STOCK' },
    submittedAgo: 3 * DAY,
    decision: {
      after: 4 * HOUR,
      mode: 'agree',
      comment: 'Стабильный рост оборотов, действующий кредит на оборудование обслуживается без просрочек.',
    },
  },
  {
    borrowerId: 'c-petrova',
    userId: 'u-petrova',
    loan: { product: 'WORKING_CAPITAL', amount: 3_000_000, termMonths: 12, purpose: 'STOCK' },
    finance: { monthlyRevenue: 1_200_000, monthlyExpenses: 900_000 },
    submittedAgo: 2 * DAY,
    decision: {
      after: 3 * HOUR,
      mode: 'agree',
      comment: 'Сезонная выручка: меньшая сумма на больший срок, чтобы платёж проходил и в слабые месяцы.',
    },
  },
  {
    borrowerId: 'c-novikov',
    userId: 'u-novikov',
    loan: { product: 'EQUIPMENT', amount: 2_000_000, termMonths: 24, purpose: 'EQUIPMENT' },
    submittedAgo: 12 * DAY,
    decision: {
      after: 5 * HOUR,
      mode: 'agree',
      comment: 'Бизнесу 8 мес., кредитной истории нет. Клиенту показан стартовый продукт.',
    },
  },

  // --- Очередь банка ---
  {
    borrowerId: 'c-technostroy',
    loan: { product: 'CREDIT_LINE', amount: 25_000_000, termMonths: 24, purpose: 'CONTRACT' },
    finance: {
      monthlyRevenue: 38_000_000,
      monthlyExpenses: 31_000_000,
      hasOtherLoans: true,
      otherLoansPayment: 900_000,
      collateral: 'REAL_ESTATE',
      collateralValue: 40_000_000,
    },
    submittedAgo: 50 * MIN,
  },
  {
    borrowerId: 'c-vector',
    loan: { product: 'EQUIPMENT', amount: 12_000_000, termMonths: 36, purpose: 'EQUIPMENT' },
    finance: {
      monthlyRevenue: 20_000_000,
      monthlyExpenses: 16_000_000,
      hasOtherLoans: true,
      otherLoansPayment: 1_400_000,
      collateral: 'VEHICLE',
      collateralValue: 14_000_000,
    },
    submittedAgo: 3 * HOUR,
  },
  {
    borrowerId: 'c-smirnov',
    loan: { product: 'WORKING_CAPITAL', amount: 1_500_000, termMonths: 18, purpose: 'CASH_GAP' },
    finance: { monthlyRevenue: 900_000, monthlyExpenses: 700_000, hasOtherLoans: true, otherLoansPayment: 45_000 },
    submittedAgo: 5 * HOUR,
  },
  {
    borrowerId: 'c-greengarden',
    loan: { product: 'INVESTMENT', amount: 6_000_000, termMonths: 36, purpose: 'EXPANSION' },
    finance: {
      monthlyRevenue: 4_500_000,
      monthlyExpenses: 3_600_000,
      hasOtherLoans: true,
      otherLoansPayment: 220_000,
      collateral: 'REAL_ESTATE',
      collateralValue: 9_000_000,
    },
    submittedAgo: 10_000,
    // Скоринг «идёт» около минуты — видно, как заявка доезжает до очереди
    timings: { VALIDATION: 1_000, ENRICHMENT: 3_000, SCORING: 6_000, ROUTE: 75_000 },
  },
  {
    borrowerId: 'c-megapolis',
    loan: { product: 'INVESTMENT', amount: 40_000_000, termMonths: 60, purpose: 'EXPANSION' },
    finance: {
      monthlyRevenue: 15_500_000,
      monthlyExpenses: 10_500_000,
      hasOtherLoans: true,
      otherLoansPayment: 1_900_000,
      collateral: 'REAL_ESTATE',
      collateralValue: 75_000_000,
    },
    submittedAgo: 1_000,
    timings: { VALIDATION: 500, ENRICHMENT: 12_000, SCORING: 25_000, ROUTE: 40_000 },
  },
  {
    borrowerId: 'c-kovaleva',
    loan: { product: 'WORKING_CAPITAL', amount: 600_000, termMonths: 12, purpose: 'STOCK' },
    finance: { monthlyRevenue: 800_000, monthlyExpenses: 600_000 },
    submittedAgo: 2 * DAY,
  },
  {
    borrowerId: 'c-north',
    loan: { product: 'WORKING_CAPITAL', amount: 8_000_000, termMonths: 24, purpose: 'CONTRACT' },
    finance: { monthlyRevenue: 8_000_000, monthlyExpenses: 6_200_000, hasOtherLoans: true, otherLoansPayment: 600_000 },
    submittedAgo: DAY + 6 * HOUR,
    decision: {
      after: 2 * HOUR,
      mode: 'override',
      request: {
        decision: 'REJECTED',
        rejectReason: 'OTHER',
        comment:
          'В картотеке арбитражных дел — 3 иска от поставщиков на 11,4 млн ₽ за полгода. Модель этого не учитывает, риск неплатежа выше расчётного.',
      },
    },
  },
  {
    borrowerId: 'c-orlov',
    loan: { product: 'WORKING_CAPITAL', amount: 2_000_000, termMonths: 12, purpose: 'STOCK' },
    finance: { monthlyRevenue: 1_500_000, monthlyExpenses: 1_250_000 },
    submittedAgo: DAY,
    decision: { after: 90 * MIN, mode: 'agree', by: OFFICER_2 },
  },
  {
    borrowerId: 'c-print',
    loan: { product: 'EQUIPMENT', amount: 3_500_000, termMonths: 36, purpose: 'EQUIPMENT' },
    finance: { monthlyRevenue: 6_000_000, monthlyExpenses: 4_700_000, hasOtherLoans: true, otherLoansPayment: 120_000 },
    submittedAgo: 20 * DAY,
    decision: { after: 2 * HOUR, mode: 'agree', by: OFFICER_2, comment: 'Надёжный клиент, оборудование ликвидно.' },
    response: { type: 'accept', after: DAY, signAfter: DAY + HOUR },
  },
];

export function nextNumber(db: MockDb): { id: string; number: string } {
  db.sequence += 1;
  return { id: `a${db.sequence}`, number: `2026-${String(db.sequence).padStart(5, '0')}` };
}

/** Хук конвейера: выданный кредит появляется в продуктах клиента, деньги — на счёте. */
export function disbursementHooks(db: MockDb): PipelineHooks {
  return {
    onDisbursed(app: StoredApplication, at: number) {
      const terms = app.decision?.terms;
      if (!app.userId || !terms) return;
      const products = (db.products[app.userId] ??= []);
      const next = new Date(at);
      next.setMonth(next.getMonth() + 1);
      const end = new Date(at);
      end.setMonth(end.getMonth() + terms.termMonths);

      const loan: LoanProduct = {
        id: `loan-${app.id}`,
        kind: 'LOAN',
        title: 'Кредит для бизнеса',
        contractNumber: `КД-${app.number}`,
        amount: terms.amount,
        debt: terms.amount,
        ratePercent: terms.ratePercent,
        nextPayment: { date: next.toISOString(), amount: terms.monthlyPayment },
        endDate: end.toISOString(),
        applicationId: app.id,
      };
      products.push(loan);
      const account = products.find((p) => p.kind === 'ACCOUNT');
      if (account && account.kind === 'ACCOUNT') account.balance += terms.amount;
    },
  };
}

function seedApplication(db: MockDb, spec: SeedSpec, now: number) {
  const profile = BORROWERS[spec.borrowerId];
  const form = buildPrefilledForm(profile, { ...spec.loan, purposeComment: '' });
  form.finance = { ...form.finance, ...spec.finance };
  form.consents = { creditHistory: true, dataProcessing: true };

  const hooks = disbursementHooks(db);
  const t0 = now - spec.submittedAgo;
  const app = createApplication({
    ...nextNumber(db),
    userId: spec.userId ?? null,
    borrowerId: spec.borrowerId,
    form,
    createdAt: t0 - 25 * MIN,
    submittedAt: t0,
    timings: spec.timings,
  });

  if (spec.decision) {
    const at = t0 + spec.decision.after;
    advance(app, at, hooks);
    const rec = app.scoring?.recommendation;
    if (app.status === 'UNDER_REVIEW' && rec) {
      const request: BankDecisionRequest =
        spec.decision.mode === 'agree'
          ? {
              decision: rec.decision,
              terms: rec.terms ?? undefined,
              rejectReason: rec.rejectReason ?? undefined,
              comment: spec.decision.comment ?? '',
            }
          : spec.decision.request;
      applyDecision(app, request, spec.decision.by ?? OFFICER, at);
    }
  }

  if (spec.response) {
    const at = t0 + spec.response.after;
    advance(app, at, hooks);
    if (spec.response.type === 'decline') {
      declineOffer(app, spec.response.reason, at);
    } else {
      acceptOffer(app, at);
      if (spec.response.signAfter) {
        const signAt = t0 + spec.response.signAfter;
        advance(app, signAt, hooks);
        signDocuments(app, requestSignCode(app, signAt), signAt);
      }
    }
  }

  advance(app, now, hooks);
  db.applications.push(app);
}

export function createSeed(now: number): MockDb {
  const db: MockDb = {
    version: DB_VERSION,
    seededAt: new Date(now).toISOString(),
    sequence: 400,
    applications: [],
    drafts: {},
    products: {
      'u-romashka': [
        { id: 'acc-romashka', kind: 'ACCOUNT', title: 'Расчётный счёт', maskedNumber: '•• 4521', balance: 4_830_000 },
        {
          id: 'loan-romashka-1',
          kind: 'LOAN',
          title: 'Кредит на оборудование',
          contractNumber: 'КД-2023/118',
          amount: 6_000_000,
          debt: 2_100_000,
          ratePercent: 15.9,
          nextPayment: { date: new Date(now + 12 * DAY).toISOString(), amount: 160_000 },
          endDate: '2027-12-05T00:00:00.000Z',
        },
      ],
      'u-petrova': [
        { id: 'acc-petrova', kind: 'ACCOUNT', title: 'Расчётный счёт', maskedNumber: '•• 8834', balance: 312_400 },
      ],
      'u-novikov': [
        { id: 'acc-novikov', kind: 'ACCOUNT', title: 'Расчётный счёт', maskedNumber: '•• 1907', balance: 184_500 },
      ],
    },
  };

  for (const spec of SEEDS) seedApplication(db, spec, now);

  // Незаконченная анкета ИП Новикова — проверка автосохранения и «продолжить с места»
  const novikov = BORROWERS['c-novikov'];
  db.drafts['u-novikov'] = {
    id: 'draft-novikov',
    form: buildPrefilledForm(novikov, {
      product: 'WORKING_CAPITAL',
      amount: 500_000,
      termMonths: 12,
      purpose: 'STOCK',
    }),
    step: 1,
    createdAt: new Date(now - 26 * HOUR).toISOString(),
    updatedAt: new Date(now - 20 * HOUR).toISOString(),
    prefilled: prefilledFields(novikov),
  };

  return db;
}

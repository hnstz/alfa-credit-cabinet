import { canTransition, DECISION_RESULT_LABEL, RISK_LABEL } from '@/entities/application';
import type {
  Actor,
  ApplicationForm,
  ApplicationStatus,
  BankDecisionRequest,
  DecisionKind,
  LoanTerms,
  SigningDocument,
} from '@/entities/application';
import { annuityPayment } from '@/shared/lib/finance';
import { formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { findBorrower } from '../fixtures/borrowers';
import type { ScheduledAction, StoredApplication } from '../types';
import { explainCounter } from './clientTexts';
import { computeEnrichment, computeScoring } from './scoring';

/**
 * Конвейер заявки: автоматические шаги по расписанию + действия людей.
 * Расписание хранится в заявке, а «время» продвигается при каждом запросе (advance),
 * поэтому статус меняется сам и одинаково виден в соседних вкладках.
 */

export const SYSTEM: Actor = { type: 'system', name: 'Кредитный конвейер' };
export const SCORING_ACTOR: Actor = { type: 'system', name: 'ML-скоринг' };
export const AUTO_DECISION_ACTOR: Actor = { type: 'system', name: 'Автоматическое решение' };

/** Через сколько мс после отправки срабатывает каждый шаг. */
export const PIPELINE_TIMINGS: Record<'VALIDATION' | 'ENRICHMENT' | 'SCORING' | 'ROUTE', number> = {
  VALIDATION: 2_000,
  ENRICHMENT: 5_000,
  SCORING: 9_000,
  ROUTE: 14_000,
};
const SIGNING_DELAY = 3_000;
const DISBURSE_DELAY = 4_000;
const OFFER_VALID_DAYS = 30;

export class MockApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

export function clientActor(app: StoredApplication): Actor {
  return { type: 'client', name: app.form.contacts.contactName || app.form.company.name };
}

function log(
  app: StoredApplication,
  at: number,
  actor: Actor,
  action: string,
  stage: ApplicationStatus = app.status,
  comment?: string,
) {
  app.audit.push({ id: `${app.id}-${app.audit.length + 1}`, at: iso(at), actor, stage, action, comment });
}

function setStatus(app: StoredApplication, status: ApplicationStatus, at: number) {
  if (!canTransition(app.status, status)) {
    throw new MockApiError(409, 'INVALID_TRANSITION', `Недопустимый переход ${app.status} → ${status}`);
  }
  app.status = status;
  app.updatedAt = iso(at);
  app.history.push({ status, at: iso(at) });
}

function schedule(app: StoredApplication, at: number, action: ScheduledAction) {
  app.schedule.push({ at, action });
  app.schedule.sort((a, b) => a.at - b.at);
}

export function describeTerms(t: LoanTerms): string {
  return `${formatMoney(t.amount)} · ${formatMonths(t.termMonths)} · ${formatPercent(t.ratePercent)}`;
}

/* ---------- Создание ---------- */

export interface CreateApplicationInput {
  id: string;
  number: string;
  userId: string | null;
  borrowerId: string;
  form: ApplicationForm;
  createdAt?: number;
  submittedAt: number;
  timings?: Partial<typeof PIPELINE_TIMINGS>;
}

export function createApplication(input: CreateApplicationInput): StoredApplication {
  const timings = { ...PIPELINE_TIMINGS, ...input.timings };
  const t0 = input.submittedAt;
  const app: StoredApplication = {
    id: input.id,
    number: input.number,
    userId: input.userId,
    borrowerId: input.borrowerId,
    status: 'SUBMITTED',
    createdAt: iso(input.createdAt ?? t0),
    submittedAt: iso(t0),
    updatedAt: iso(t0),
    form: input.form,
    history: [{ status: 'SUBMITTED', at: iso(t0) }],
    schedule: [
      { at: t0 + timings.VALIDATION, action: 'VALIDATION' },
      { at: t0 + timings.ENRICHMENT, action: 'ENRICHMENT' },
      { at: t0 + timings.SCORING, action: 'SCORING' },
      { at: t0 + timings.ROUTE, action: 'ROUTE' },
    ],
    enrichment: null,
    scoring: null,
    decision: null,
    clientExplanation: null,
    suggestedAmount: null,
    audit: [],
    signing: null,
  };
  log(app, t0, clientActor(app), 'Заявка отправлена в банк');
  return app;
}

/* ---------- Автоматические шаги ---------- */

export interface PipelineHooks {
  onDisbursed?: (app: StoredApplication, at: number) => void;
}

function buildDocuments(app: StoredApplication): SigningDocument[] {
  const docs: SigningDocument[] = [
    { id: 'contract', title: 'Кредитный договор', description: 'Сумма, срок, ставка и порядок погашения', pages: 14 },
    { id: 'schedule', title: 'График платежей', description: 'Даты и суммы ежемесячных платежей', pages: 2 },
    {
      id: 'disbursement',
      title: 'Заявление на выдачу кредита',
      description: 'Перечисление денег на ваш расчётный счёт',
      pages: 1,
    },
  ];
  const c = app.form.company;
  if (c.legalForm === 'IP' && c.maritalStatus === 'MARRIED' && c.spouseConsent) {
    docs.push({ id: 'spouse', title: 'Согласие супруга(и)', description: 'Поручительство по кредиту', pages: 2 });
  }
  return docs;
}

function runStep(app: StoredApplication, action: ScheduledAction, at: number, hooks: PipelineHooks) {
  const profile = findBorrower(app.borrowerId);
  if (!profile) throw new MockApiError(500, 'NO_PROFILE', 'Нет профиля заёмщика');

  switch (action) {
    case 'VALIDATION':
      setStatus(app, 'VALIDATION', at);
      log(app, at, SYSTEM, 'Форматно-логический контроль анкеты: ошибок нет');
      break;

    case 'ENRICHMENT':
      setStatus(app, 'ENRICHMENT', at);
      log(app, at, SYSTEM, 'Запрошены данные: реестр, кредитная история, ФНС, обороты по счёту');
      break;

    case 'SCORING': {
      app.enrichment = computeEnrichment(profile, app.form, at);
      const warnings = app.enrichment.checks.filter((c) => c.level !== 'ok');
      log(
        app,
        at,
        SYSTEM,
        `Данные получены (${app.enrichment.registry.source}, НБКИ, ФНС, счёт)`,
        'ENRICHMENT',
        warnings.length ? `Обратить внимание: ${warnings.map((w) => w.text).join('; ')}` : 'Замечаний нет',
      );
      setStatus(app, 'SCORING', at);
      break;
    }

    case 'ROUTE': {
      if (!app.enrichment) app.enrichment = computeEnrichment(profile, app.form, at);
      const scoring = computeScoring({ form: app.form, enrichment: app.enrichment, profile, now: at });
      app.scoring = scoring;
      const rec = scoring.recommendation;
      log(
        app,
        at,
        SCORING_ACTOR,
        `Скоринг: ${scoring.score} баллов, риск ${RISK_LABEL[scoring.riskLevel].toLowerCase()}, рекомендация — ${DECISION_RESULT_LABEL[rec.decision].toLowerCase()}`,
        'SCORING',
        `PD ${formatPercent(scoring.pd * 100, 2)}, уверенность ${Math.round(scoring.confidence * 100)} %. ${rec.routeReason}`,
      );
      if (rec.route === 'AUTO') {
        applyDecision(
          app,
          {
            decision: rec.decision,
            terms: rec.terms ?? undefined,
            rejectReason: rec.rejectReason ?? undefined,
            comment: '',
          },
          AUTO_DECISION_ACTOR,
          at,
        );
      } else {
        setStatus(app, 'UNDER_REVIEW', at);
        log(app, at, SYSTEM, 'Направлена на рассмотрение кредитному специалисту', 'UNDER_REVIEW', rec.routeReason);
      }
      break;
    }

    case 'SIGNING':
      setStatus(app, 'SIGNING', at);
      app.signing = { documents: buildDocuments(app), code: null, signedAt: null };
      log(app, at, SYSTEM, 'Документы сформированы и отправлены клиенту на подпись');
      break;

    case 'DISBURSE':
      setStatus(app, 'DISBURSED', at);
      log(
        app,
        at,
        SYSTEM,
        `Кредит выдан: ${formatMoney(app.decision?.terms?.amount ?? 0)} зачислены на расчётный счёт`,
      );
      hooks.onDisbursed?.(app, at);
      break;
  }
}

/** Выполняет все автоматические шаги, время которых наступило. */
export function advance(app: StoredApplication, now: number, hooks: PipelineHooks = {}) {
  while (app.schedule.length > 0 && app.schedule[0].at <= now) {
    const step = app.schedule.shift()!;
    runStep(app, step.action, step.at, hooks);
  }
}

/* ---------- Решение ---------- */

function sameTerms(a: LoanTerms | null, b: LoanTerms | null): boolean {
  if (!a || !b) return a === b;
  return a.amount === b.amount && a.termMonths === b.termMonths && a.ratePercent === b.ratePercent;
}

export function applyDecision(
  app: StoredApplication,
  request: BankDecisionRequest,
  actor: Actor,
  at: number,
) {
  const rec = app.scoring?.recommendation ?? null;
  const kind: DecisionKind = request.decision;
  const requested = { amount: app.form.loan.amount ?? 0, termMonths: app.form.loan.termMonths ?? 12 };

  let terms: LoanTerms | null = null;
  if (kind !== 'REJECTED') {
    const source = request.terms ?? rec?.terms ?? {
      ...requested,
      ratePercent: 19.9,
      monthlyPayment: 0,
    };
    // Платёж всегда пересчитываем на сервере — UI мог прислать округлённый
    terms = { ...source, monthlyPayment: annuityPayment(source.amount, source.ratePercent, source.termMonths) };
  }

  const isOverride = actor.type === 'officer' && rec !== null && (rec.decision !== kind || !sameTerms(rec.terms, terms));
  if (isOverride && request.comment.trim().length < 10) {
    throw new MockApiError(422, 'REASON_REQUIRED', 'Укажите причину ручного решения (не короче 10 символов)');
  }
  if (terms && (terms.amount < 100_000 || terms.termMonths < 3 || terms.ratePercent <= 0 || terms.ratePercent > 60)) {
    throw new MockApiError(422, 'INVALID_TERMS', 'Проверьте условия: сумма, срок и ставка');
  }
  const fromStatus = app.status;
  const profile = findBorrower(app.borrowerId);

  app.decision = {
    decision: kind,
    terms,
    rejectReason: kind === 'REJECTED' ? (request.rejectReason ?? rec?.rejectReason ?? 'OTHER') : null,
    recommended: rec?.decision ?? null,
    isOverride,
    comment: request.comment.trim(),
    decidedBy: actor,
    decidedAt: iso(at),
  };
  app.clientExplanation =
    kind === 'COUNTER_OFFER' && terms && profile ? explainCounter(requested, terms, profile.scenario) : null;
  app.suggestedAmount =
    kind === 'REJECTED' && rec && rec.maxAffordableAmount >= 300_000 && rec.maxAffordableAmount < requested.amount
      ? rec.maxAffordableAmount
      : null;

  setStatus(app, kind, at);

  const label = DECISION_RESULT_LABEL[kind];
  const termsText = terms ? ` (${describeTerms(terms)})` : '';
  const action =
    actor.type !== 'officer'
      ? `${label}${termsText}`
      : isOverride
        ? `Решение: ${label.toLowerCase()}${termsText} — ручное изменение рекомендации (система: ${DECISION_RESULT_LABEL[rec!.decision].toLowerCase()})`
        : `Решение: ${label.toLowerCase()}${termsText} — согласовано с рекомендацией системы`;
  log(app, at, actor, action, fromStatus, app.decision.comment || undefined);
}

/* ---------- Действия клиента ---------- */

export function offerValidUntil(app: StoredApplication): string | null {
  if (!app.decision) return null;
  return iso(new Date(app.decision.decidedAt).getTime() + OFFER_VALID_DAYS * 86_400_000);
}

export function acceptOffer(app: StoredApplication, at: number) {
  if (app.status !== 'APPROVED' && app.status !== 'COUNTER_OFFER') {
    throw new MockApiError(409, 'NOT_AVAILABLE', 'Предложение уже недоступно');
  }
  const from = app.status;
  setStatus(app, 'OFFER_ACCEPTED', at);
  log(app, at, clientActor(app), 'Клиент принял предложение банка', from);
  schedule(app, at + SIGNING_DELAY, 'SIGNING');
}

export function declineOffer(app: StoredApplication, reason: string, at: number) {
  if (app.status !== 'APPROVED' && app.status !== 'COUNTER_OFFER') {
    throw new MockApiError(409, 'NOT_AVAILABLE', 'Предложение уже недоступно');
  }
  const from = app.status;
  setStatus(app, 'OFFER_DECLINED', at);
  log(app, at, clientActor(app), 'Клиент отказался от предложения', from, reason || undefined);
}

export function requestSignCode(app: StoredApplication, at: number): string {
  if (app.status !== 'SIGNING' || !app.signing) {
    throw new MockApiError(409, 'NOT_SIGNING', 'Документы ещё не готовы к подписанию');
  }
  const code = String(100_000 + Math.floor(Math.random() * 900_000));
  app.signing.code = code;
  log(app, at, SYSTEM, 'Клиенту отправлен код подтверждения');
  return code;
}

export function signDocuments(app: StoredApplication, code: string, at: number) {
  if (app.status !== 'SIGNING' || !app.signing) {
    throw new MockApiError(409, 'NOT_SIGNING', 'Документы ещё не готовы к подписанию');
  }
  if (!app.signing.code || app.signing.code !== code.trim()) {
    throw new MockApiError(422, 'WRONG_CODE', 'Код не подходит. Проверьте цифры или запросите новый код.');
  }
  app.signing.signedAt = iso(at);
  app.signing.code = null;
  setStatus(app, 'SIGNED', at);
  log(app, at, clientActor(app), 'Документы подписаны простой электронной подписью (код из SMS)', 'SIGNING');
  schedule(app, at + DISBURSE_DELAY, 'DISBURSE');
}

import type {
  ApplicationDraft,
  ApplicationSummary,
  BankApplication,
  BankQueueItem,
  ClientApplication,
  ClientDecision,
  DraftSummary,
  ProductCode,
} from '@/entities/application';
import type { StoredApplication, StoredDraft } from '../types';
import { CLIENT_REJECT_TEXT } from './clientTexts';
import { offerValidUntil } from './pipeline';

/** Преобразования внутренних записей в ответы API. Клиент не получает скоринг и аудит. */

export const WIZARD_STEPS = 4;

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `+7 ••• •••-${digits.slice(-4, -2)}-${digits.slice(-2)}` : phone;
}

export function toSummary(app: StoredApplication): ApplicationSummary {
  return {
    id: app.id,
    number: app.number,
    status: app.status,
    product: (app.form.loan.product || 'WORKING_CAPITAL') as ProductCode,
    amount: app.form.loan.amount ?? 0,
    termMonths: app.form.loan.termMonths ?? 0,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function toClientDecision(app: StoredApplication): ClientDecision | null {
  const d = app.decision;
  if (!d) return null;
  const validUntil = offerValidUntil(app) ?? d.decidedAt;

  if (d.decision === 'APPROVED' && d.terms) {
    return { kind: 'APPROVED', offer: d.terms, decidedAt: d.decidedAt, validUntil };
  }
  if (d.decision === 'COUNTER_OFFER' && d.terms) {
    return {
      kind: 'COUNTER_OFFER',
      requested: { amount: app.form.loan.amount ?? 0, termMonths: app.form.loan.termMonths ?? 0 },
      offer: d.terms,
      explanation: app.clientExplanation ?? '',
      decidedAt: d.decidedAt,
      validUntil,
    };
  }
  const text = CLIENT_REJECT_TEXT[d.rejectReason ?? 'OTHER'];
  return {
    kind: 'REJECTED',
    reason: { title: text.title, text: text.text },
    advice: text.advice(app.suggestedAmount),
    suggestedAmount: app.suggestedAmount,
    decidedAt: d.decidedAt,
  };
}

export function toClientApplication(app: StoredApplication): ClientApplication {
  return {
    ...toSummary(app),
    purpose: app.form.loan.purpose || 'OTHER',
    submittedAt: app.submittedAt,
    history: app.history,
    decision: toClientDecision(app),
    signing: app.signing
      ? {
          documents: app.signing.documents,
          signedAt: app.signing.signedAt,
          phoneMask: maskPhone(app.form.contacts.phone),
        }
      : null,
    stageEta: app.schedule[0] ? new Date(app.schedule[0].at).toISOString() : null,
  };
}

export function toBankApplication(app: StoredApplication): BankApplication {
  return {
    id: app.id,
    number: app.number,
    status: app.status,
    product: (app.form.loan.product || 'WORKING_CAPITAL') as ProductCode,
    createdAt: app.createdAt,
    submittedAt: app.submittedAt,
    updatedAt: app.updatedAt,
    form: app.form,
    enrichment: app.enrichment,
    scoring: app.scoring,
    decision: app.decision,
    audit: app.audit,
  };
}

export function toQueueItem(app: StoredApplication): BankQueueItem {
  return {
    id: app.id,
    number: app.number,
    status: app.status,
    companyName: app.form.company.name,
    inn: app.form.company.inn,
    legalForm: app.form.company.legalForm,
    product: (app.form.loan.product || 'WORKING_CAPITAL') as ProductCode,
    amount: app.form.loan.amount ?? 0,
    termMonths: app.form.loan.termMonths ?? 0,
    submittedAt: app.submittedAt,
    updatedAt: app.updatedAt,
    score: app.scoring?.score ?? null,
    riskLevel: app.scoring?.riskLevel ?? null,
    recommendation: app.scoring?.recommendation.decision ?? null,
  };
}

export function toDraft(draft: StoredDraft): ApplicationDraft {
  return {
    id: draft.id,
    form: draft.form,
    step: draft.step,
    updatedAt: draft.updatedAt,
    prefilled: draft.prefilled,
  };
}

export function toDraftSummary(draft: StoredDraft): DraftSummary {
  return {
    id: draft.id,
    step: draft.step,
    totalSteps: WIZARD_STEPS,
    updatedAt: draft.updatedAt,
    product: draft.form.loan.product,
    amount: draft.form.loan.amount,
  };
}

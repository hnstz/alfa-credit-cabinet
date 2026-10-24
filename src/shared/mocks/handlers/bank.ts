import { delay, http, HttpResponse } from 'msw';
import type {
  ApplicationStatus,
  BankDecisionRequest,
  BankQueueItem,
  QueueStatusFilter,
  RiskLevel,
} from '@/entities/application';
import { withDb } from '../db';
import { applyDecision, MockApiError } from '../engine/pipeline';
import { toBankApplication, toQueueItem } from '../engine/views';
import { handleError, requireRole, url } from './session';

const STATUS_GROUPS: Record<Exclude<QueueStatusFilter, 'ALL'>, readonly ApplicationStatus[]> = {
  ACTION: ['UNDER_REVIEW'],
  PIPELINE: ['SUBMITTED', 'VALIDATION', 'ENRICHMENT', 'SCORING', 'NEEDS_INFO'],
  DECIDED: ['APPROVED', 'COUNTER_OFFER', 'OFFER_ACCEPTED', 'SIGNING', 'SIGNED'],
  CLOSED: ['REJECTED', 'OFFER_DECLINED', 'DISBURSED', 'CANCELLED', 'EXPIRED'],
};

const SORTERS: Record<string, (a: BankQueueItem, b: BankQueueItem) => number> = {
  submittedAt: (a, b) => a.submittedAt.localeCompare(b.submittedAt),
  amount: (a, b) => a.amount - b.amount,
  score: (a, b) => (a.score ?? -1) - (b.score ?? -1),
  companyName: (a, b) => a.companyName.localeCompare(b.companyName, 'ru'),
};

const sameDay = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString();

export const bankHandlers = [
  http.get(url('/bank/applications'), async ({ request }) => {
    await delay(300);
    const user = requireRole(request, 'officer');
    if (user instanceof Response) return user;

    const params = new URL(request.url).searchParams;
    const status = (params.get('status') ?? 'ALL') as QueueStatusFilter;
    const risk = (params.get('risk')?.split(',').filter(Boolean) ?? []) as RiskLevel[];
    const minAmount = Number(params.get('minAmount')) || null;
    const maxAmount = Number(params.get('maxAmount')) || null;
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const [sortKey = 'submittedAt', sortDir = 'desc'] = (params.get('sort') ?? '').split(':');

    return HttpResponse.json(
      withDb((db, now) => {
        const all = db.applications.filter((a) => a.status !== 'DRAFT');
        const decisions = all.filter((a) => a.decision?.decidedBy.type === 'officer');

        let items = all.map(toQueueItem);
        if (status !== 'ALL' && STATUS_GROUPS[status]) {
          items = items.filter((i) => STATUS_GROUPS[status].includes(i.status));
        }
        if (risk.length) items = items.filter((i) => i.riskLevel !== null && risk.includes(i.riskLevel));
        if (minAmount !== null) items = items.filter((i) => i.amount >= minAmount);
        if (maxAmount !== null) items = items.filter((i) => i.amount <= maxAmount);
        if (q) {
          items = items.filter(
            (i) => i.companyName.toLowerCase().includes(q) || i.inn.includes(q) || i.number.includes(q),
          );
        }
        const sorter = SORTERS[sortKey] ?? SORTERS.submittedAt;
        items.sort((a, b) => sorter(a, b) * (sortDir === 'asc' ? 1 : -1));

        return {
          items,
          total: items.length,
          counters: {
            awaitingDecision: all.filter((a) => a.status === 'UNDER_REVIEW').length,
            inPipeline: all.filter((a) => STATUS_GROUPS.PIPELINE.includes(a.status)).length,
            decidedToday: all.filter((a) => a.decision && sameDay(a.decision.decidedAt, now)).length,
            overrideRate: decisions.length
              ? decisions.filter((a) => a.decision?.isOverride).length / decisions.length
              : 0,
          },
        };
      }),
    );
  }),

  http.get(url('/bank/applications/:id'), async ({ request, params }) => {
    await delay(250);
    const user = requireRole(request, 'officer');
    if (user instanceof Response) return user;
    try {
      return HttpResponse.json(
        withDb((db) => {
          const app = db.applications.find((a) => a.id === String(params.id));
          if (!app) throw new MockApiError(404, 'NOT_FOUND', 'Заявка не найдена');
          return toBankApplication(app);
        }),
      );
    } catch (e) {
      return handleError(e);
    }
  }),

  http.post(url('/bank/applications/:id/decision'), async ({ request, params }) => {
    await delay(600);
    const user = requireRole(request, 'officer');
    if (user instanceof Response) return user;
    const body = (await request.json()) as BankDecisionRequest;

    try {
      return HttpResponse.json(
        withDb((db, now) => {
          const app = db.applications.find((a) => a.id === String(params.id));
          if (!app) throw new MockApiError(404, 'NOT_FOUND', 'Заявка не найдена');
          if (app.status !== 'UNDER_REVIEW') {
            throw new MockApiError(409, 'ALREADY_DECIDED', 'По заявке уже принято решение — обновите страницу');
          }
          applyDecision(app, { ...body, comment: body.comment ?? '' }, { type: 'officer', name: user.fullName }, now);
          return toBankApplication(app);
        }),
      );
    } catch (e) {
      return handleError(e);
    }
  }),
];

import { delay, http, HttpResponse } from 'msw';
import type { ApplicationForm, DraftPreset } from '@/entities/application';
import type { User } from '@/entities/user';
import { findBorrower } from '../fixtures/borrowers';
import type { BorrowerProfile } from '../fixtures/borrowers';
import { withDb } from '../db';
import { buildPrefilledForm, prefilledFields, presetToLoan } from '../engine/forms';
import {
  acceptOffer,
  createApplication,
  declineOffer,
  MockApiError,
  requestSignCode,
  signDocuments,
} from '../engine/pipeline';
import { toClientApplication, toDraft, toDraftSummary, toSummary } from '../engine/views';
import { nextNumber } from '../seed';
import type { MockDb, StoredApplication } from '../types';
import { errorResponse, handleError, requireRole, url } from './session';

function profileOf(user: User): BorrowerProfile {
  const profile = user.company ? findBorrower(user.company.id) : undefined;
  if (!profile) throw new MockApiError(404, 'NO_PROFILE', 'Профиль компании не найден');
  return profile;
}

function findOwn(db: MockDb, user: User, id: string): StoredApplication {
  const app = db.applications.find((a) => a.id === id && a.userId === user.id);
  if (!app) throw new MockApiError(404, 'NOT_FOUND', 'Заявка не найдена');
  return app;
}

/** Серверная проверка перед отправкой: подробную валидацию делает мастер, здесь — страховка. */
function assertSubmittable(form: ApplicationForm) {
  const missing: string[] = [];
  if (!form.loan.product) missing.push('продукт');
  if (!form.loan.amount) missing.push('сумма');
  if (!form.loan.termMonths) missing.push('срок');
  if (!form.loan.purpose) missing.push('цель');
  if (!form.company.inn) missing.push('ИНН');
  if (!form.finance.monthlyRevenue) missing.push('выручка');
  if (!form.consents.creditHistory || !form.consents.dataProcessing) missing.push('согласия');
  if (missing.length) {
    throw new MockApiError(422, 'VALIDATION_ERROR', `Анкета заполнена не полностью: ${missing.join(', ')}`);
  }
}

export const applicationHandlers = [
  // ---------- Черновик ----------
  // Эти маршруты объявлены раньше /applications/:id, чтобы 'draft' не принимался за id
  http.get(url('/applications/draft/summary'), async ({ request }) => {
    await delay(200);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    return HttpResponse.json(withDb((db) => (db.drafts[user.id] ? toDraftSummary(db.drafts[user.id]) : null)));
  }),

  http.get(url('/applications/draft'), async ({ request }) => {
    await delay(300);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    return HttpResponse.json(withDb((db) => (db.drafts[user.id] ? toDraft(db.drafts[user.id]) : null)));
  }),

  http.post(url('/applications/draft'), async ({ request }) => {
    await delay(400);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const preset = ((await request.json().catch(() => ({}))) ?? {}) as DraftPreset;

    try {
      return HttpResponse.json(
        withDb((db, now) => {
          const loanPreset = presetToLoan(preset);
          const existing = db.drafts[user.id];
          if (existing) {
            // Пришли из предложения в ленте — подставляем его условия в начатую анкету
            if (Object.keys(loanPreset).length > 0) {
              existing.form.loan = { ...existing.form.loan, ...loanPreset };
              existing.step = 0;
              existing.updatedAt = new Date(now).toISOString();
            }
            return toDraft(existing);
          }
          const profile = profileOf(user);
          const draft = {
            id: `draft-${user.id}-${now}`,
            form: buildPrefilledForm(profile, loanPreset),
            step: 0,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            prefilled: [
              ...prefilledFields(profile),
              ...Object.keys(loanPreset).map((k) => `loan.${k}`),
            ],
          };
          db.drafts[user.id] = draft;
          return toDraft(draft);
        }),
        { status: 201 },
      );
    } catch (e) {
      return handleError(e);
    }
  }),

  http.put(url('/applications/draft'), async ({ request }) => {
    await delay(350);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const body = (await request.json()) as { form: ApplicationForm; step: number };

    return withDb((db, now) => {
      const draft = db.drafts[user.id];
      if (!draft) return errorResponse(404, 'NO_DRAFT', 'Черновик не найден — начните анкету заново');
      draft.form = body.form;
      draft.step = body.step;
      draft.updatedAt = new Date(now).toISOString();
      return HttpResponse.json({ updatedAt: draft.updatedAt });
    });
  }),

  http.delete(url('/applications/draft'), async ({ request }) => {
    await delay(250);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    withDb((db) => {
      delete db.drafts[user.id];
    });
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(url('/applications/draft/submit'), async ({ request }) => {
    await delay(700);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;

    try {
      const app = withDb((db, now) => {
        const draft = db.drafts[user.id];
        if (!draft) throw new MockApiError(404, 'NO_DRAFT', 'Черновик не найден');
        assertSubmittable(draft.form);
        const profile = profileOf(user);
        const created = createApplication({
          ...nextNumber(db),
          userId: user.id,
          borrowerId: profile.company.id,
          form: draft.form,
          createdAt: new Date(draft.createdAt).getTime(),
          submittedAt: now,
        });
        db.applications.push(created);
        delete db.drafts[user.id];
        return toClientApplication(created);
      });
      return HttpResponse.json(app, { status: 201 });
    } catch (e) {
      return handleError(e);
    }
  }),

  // ---------- Заявки ----------
  http.get(url('/applications'), async ({ request }) => {
    await delay(250);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    return HttpResponse.json(
      withDb((db) =>
        db.applications
          .filter((a) => a.userId === user.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(toSummary),
      ),
    );
  }),

  http.get(url('/applications/:id'), async ({ request, params }) => {
    await delay(150);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    try {
      return HttpResponse.json(withDb((db) => toClientApplication(findOwn(db, user, String(params.id)))));
    } catch (e) {
      return handleError(e);
    }
  }),

  http.post(url('/applications/:id/offer/accept'), async ({ request, params }) => {
    await delay(500);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    try {
      return HttpResponse.json(
        withDb((db, now) => {
          const app = findOwn(db, user, String(params.id));
          acceptOffer(app, now);
          return toClientApplication(app);
        }),
      );
    } catch (e) {
      return handleError(e);
    }
  }),

  http.post(url('/applications/:id/offer/decline'), async ({ request, params }) => {
    await delay(500);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    try {
      return HttpResponse.json(
        withDb((db, now) => {
          const app = findOwn(db, user, String(params.id));
          declineOffer(app, body.reason ?? '', now);
          return toClientApplication(app);
        }),
      );
    } catch (e) {
      return handleError(e);
    }
  }),

  // ---------- Подписание (мок) ----------
  http.post(url('/applications/:id/signing/code'), async ({ request, params }) => {
    await delay(600);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    try {
      return HttpResponse.json(
        withDb((db, now) => {
          const app = findOwn(db, user, String(params.id));
          const code = requestSignCode(app, now);
          const view = toClientApplication(app);
          // В демо SMS не отправляется — код возвращаем, чтобы показать подсказку
          return { phoneMask: view.signing?.phoneMask ?? '', demoCode: code };
        }),
      );
    } catch (e) {
      return handleError(e);
    }
  }),

  http.post(url('/applications/:id/signing/confirm'), async ({ request, params }) => {
    await delay(800);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    try {
      return HttpResponse.json(
        withDb((db, now) => {
          const app = findOwn(db, user, String(params.id));
          // Выдача сработает по расписанию — при следующих запросах (см. withDb)
          signDocuments(app, body.code ?? '', now);
          return toClientApplication(app);
        }),
      );
    } catch (e) {
      return handleError(e);
    }
  }),
];

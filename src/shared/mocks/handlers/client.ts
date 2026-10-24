import { delay, http, HttpResponse } from 'msw';
import { findBorrower } from '../fixtures/borrowers';
import { withDb } from '../db';
import { buildBannerContext, predictBanner, renderBanner } from '../engine/banner';
import { buildFeed } from '../engine/feed';
import { errorResponse, requireRole, url } from './session';

const EVENTS_KEY = 'alfa-credit:banner-events';
const EVENTS_LIMIT = 200;
const BANNER_EVENTS = ['VIEW', 'CLICK', 'DISMISS'];

/** Журнал событий баннера: в реальной системе уходит в аналитику и на дообучение модели. */
function logBannerEvent(userId: string, bannerId: string, event: string) {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const list: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : [];
    list.push({ at: new Date().toISOString(), userId, bannerId, event });
    localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(-EVENTS_LIMIT)));
  } catch {
    /* журнал необязателен */
  }
  console.debug('[banner:event]', event, bannerId);
}

/** Сводка клиента: продукты, персональная лента и баннер. */
export const clientHandlers = [
  http.get(url('/client/products'), async ({ request }) => {
    await delay(250);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    return HttpResponse.json(withDb((db) => db.products[user.id] ?? []));
  }),

  http.get(url('/client/feed'), async ({ request }) => {
    await delay(350);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const profile = user.company ? findBorrower(user.company.id) : undefined;
    if (!profile) return errorResponse(404, 'NO_PROFILE', 'Профиль компании не найден');
    return HttpResponse.json(withDb((db, now) => buildFeed(db, user.id, profile, now)));
  }),

  /** Персональный баннер. 204 — модель решила ничего не показывать. */
  http.get(url('/client/banner'), async ({ request }) => {
    await delay(300);
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const profile = user.company ? findBorrower(user.company.id) : undefined;
    if (!profile) return errorResponse(404, 'NO_PROFILE', 'Профиль компании не найден');

    const { ctx, now } = withDb((db, at) => ({ ctx: buildBannerContext(db, user.id, profile, at), now: at }));
    const prediction = await predictBanner(ctx);
    if (!prediction) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json(renderBanner(ctx, prediction, now));
  }),

  http.post(url('/client/banner/events'), async ({ request }) => {
    const user = requireRole(request, 'client');
    if (user instanceof Response) return user;
    const body = (await request.json().catch(() => null)) as { bannerId?: unknown; event?: unknown } | null;
    if (typeof body?.bannerId !== 'string' || typeof body.event !== 'string' || !BANNER_EVENTS.includes(body.event)) {
      return errorResponse(400, 'BAD_REQUEST', 'Ожидается { bannerId, event: VIEW | CLICK | DISMISS }');
    }
    logBannerEvent(user.id, body.bannerId, body.event);
    return new HttpResponse(null, { status: 204 });
  }),
];

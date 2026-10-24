import { delay, http, HttpResponse } from 'msw';
import { resetDb } from '../db';
import { applicationHandlers } from './applications';
import { authHandlers } from './auth';
import { bankHandlers } from './bank';
import { clientHandlers } from './client';
import { url } from './session';

/** Сброс демо-данных к исходному состоянию (кнопка на странице входа). */
const demoHandlers = [
  http.post(url('/demo/reset'), async () => {
    await delay(300);
    resetDb();
    return new HttpResponse(null, { status: 204 });
  }),
];

export const handlers = [
  ...authHandlers,
  ...clientHandlers,
  ...applicationHandlers,
  ...bankHandlers,
  ...demoHandlers,
];

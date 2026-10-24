import { delay, http, HttpResponse } from 'msw';
import { authenticate } from '../fixtures/users';
import { getSessionUser, TOKEN_PREFIX, unauthorized, url } from './session';

export const authHandlers = [
  http.post(url('/auth/login'), async ({ request }) => {
    await delay(400);
    const body = (await request.json()) as { login?: string; password?: string };
    const user = authenticate(body.login?.trim() ?? '', body.password ?? '');

    if (!user) {
      return HttpResponse.json(
        { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль' },
        { status: 401 },
      );
    }
    return HttpResponse.json({ accessToken: `${TOKEN_PREFIX}${user.id}`, user });
  }),

  http.get(url('/auth/me'), async ({ request }) => {
    await delay(200);
    const header = request.headers.get('Authorization') ?? '';
    if (!header.replace(/^Bearer\s+/i, '').startsWith(TOKEN_PREFIX)) return unauthorized();

    const user = getSessionUser(request);
    return user ? HttpResponse.json(user) : unauthorized('Сессия истекла');
  }),

  http.post(url('/auth/logout'), async () => {
    await delay(100);
    return new HttpResponse(null, { status: 204 });
  }),
];

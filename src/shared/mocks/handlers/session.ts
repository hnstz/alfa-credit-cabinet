import { HttpResponse } from 'msw';
import type { User, UserRole } from '@/entities/user';
import { config } from '@/shared/config';
import { findUserById } from '../fixtures/users';
import { MockApiError } from '../engine/pipeline';

export const url = (path: string) => `${config.apiUrl}${path}`;

export const TOKEN_PREFIX = 'mock.';

export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ code, message, details }, { status });
}

export function unauthorized(message = 'Требуется авторизация') {
  return errorResponse(401, 'UNAUTHORIZED', message);
}

/** Пользователь по токену из заголовка Authorization. */
export function getSessionUser(request: Request): User | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  return findUserById(token.slice(TOKEN_PREFIX.length)) ?? null;
}

/** Проверка роли. Возвращает пользователя или готовый ответ с ошибкой. */
export function requireRole(request: Request, role: UserRole): User | Response {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== role) return errorResponse(403, 'FORBIDDEN', 'Недостаточно прав');
  return user;
}

/** Ошибки движка (MockApiError) превращаем в ответ API, остальное — 500. */
export function handleError(e: unknown) {
  if (e instanceof MockApiError) return errorResponse(e.status, e.code, e.message);
  console.error('[mocks]', e);
  return errorResponse(500, 'INTERNAL', 'Внутренняя ошибка мок-сервера');
}

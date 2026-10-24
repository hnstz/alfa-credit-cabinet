import { ApiError } from './client';

/** Текст ошибки для пользователя: сообщение API или запасная формулировка. */
export function getErrorMessage(error: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз.'): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

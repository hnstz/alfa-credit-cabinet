import { config } from '@/shared/config';
import { tokenStorage } from './token';

/** Единый формат ошибок API. Договоритесь с бэкендом: { code, message, details? } */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Не добавлять токен и не реагировать на 401 как на «сессия истекла» (для логина). */
  skipAuth?: boolean;
}

// --- Глобальная реакция на 401: AuthProvider подписывается и сбрасывает сессию ---
const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${config.apiUrl}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readErrorBody(res: Response): Promise<{ code?: string; message?: string; details?: unknown }> {
  try {
    return (await res.json()) as { code?: string; message?: string; details?: unknown };
  } catch {
    return {};
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  { query, headers, signal, skipAuth = false }: RequestOptions = {},
): Promise<T> {
  const finalHeaders = new Headers(headers);
  finalHeaders.set('Accept', 'application/json');

  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) finalHeaders.set('Content-Type', 'application/json');

  const token = tokenStorage.get();
  if (token && !skipAuth) finalHeaders.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.');
  }

  if (!res.ok) {
    const err = await readErrorBody(res);
    if (res.status === 401 && !skipAuth) {
      tokenStorage.clear();
      unauthorizedListeners.forEach((l) => l());
    }
    throw new ApiError(
      res.status,
      err.code ?? `HTTP_${res.status}`,
      err.message ?? 'Что-то пошло не так. Попробуйте ещё раз.',
      err.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
};

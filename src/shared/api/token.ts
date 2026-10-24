const KEY = 'alfa-credit:access-token';

/**
 * Токен хранится в sessionStorage: у каждой вкладки своя сессия.
 * Удобно для демо: клиент и сотрудник банка — в соседних вкладках одного браузера.
 */
export const tokenStorage = {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* хранилище недоступно — работаем без сохранения сессии */
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

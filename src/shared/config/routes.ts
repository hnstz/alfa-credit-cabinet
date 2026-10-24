/**
 * Все маршруты приложения — только здесь. В коде используем ROUTES, а не строки.
 * Лежит в shared, чтобы ссылки могли строить и страницы, и виджеты (слой app им недоступен).
 */
export const ROUTES = {
  login: '/login',
  client: {
    home: '/',
    newApplication: '/applications/new',
    application: (id: string) => `/applications/${id}`,
    decision: (id: string) => `/applications/${id}/decision`,
    signing: (id: string) => `/applications/${id}/signing`,
  },
  bank: {
    root: '/bank',
    queue: '/bank/queue',
    application: (id: string) => `/bank/applications/${id}`,
  },
  uiKit: '/ui-kit',
} as const;

/** Шаблоны путей для React Router (с параметрами). */
export const ROUTE_PATTERNS = {
  clientApplication: '/applications/:id',
  bankApplication: '/bank/applications/:id',
} as const;

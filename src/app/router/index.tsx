import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { AuthLayout } from '../layouts/AuthLayout';
import { BankLayout } from '../layouts/BankLayout';
import { ClientLayout } from '../layouts/ClientLayout';
import { GuestOnly, PageLoader, RequireAuth, RequireRole } from './guards';
import { ROUTE_PATTERNS, ROUTES } from './paths';

/**
 * Страницы грузятся лениво: клиент не скачивает код рабочего места банка и наоборот.
 * Вход и 404 — в основном бандле, они нужны сразу.
 */
export const router = createBrowserRouter([
  {
    // Пока грузится чанк первой страницы
    hydrateFallbackElement: <PageLoader />,
    children: [
      // Гостевая зона
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [{ path: ROUTES.login, element: <LoginPage /> }],
          },
        ],
      },

      // Только для авторизованных
      {
        element: <RequireAuth />,
        children: [
          // Кабинет клиента (предприниматель)
          {
            element: <RequireRole allow={['client']} />,
            children: [
              {
                element: <ClientLayout />,
                children: [
                  {
                    path: ROUTES.client.home,
                    lazy: () => import('@/pages/client-home').then((m) => ({ Component: m.ClientHomePage })),
                  },
                  {
                    path: ROUTES.client.newApplication,
                    lazy: () => import('@/pages/application-new').then((m) => ({ Component: m.ApplicationNewPage })),
                  },
                  {
                    // Один поллинг статуса на все экраны заявки
                    path: ROUTE_PATTERNS.clientApplication,
                    lazy: () => import('@/pages/application').then((m) => ({ Component: m.ApplicationLayout })),
                    children: [
                      {
                        index: true,
                        lazy: () => import('@/pages/application').then((m) => ({ Component: m.ApplicationStatusPage })),
                      },
                      {
                        path: 'decision',
                        lazy: () => import('@/pages/application').then((m) => ({ Component: m.ApplicationDecisionPage })),
                      },
                      {
                        path: 'signing',
                        lazy: () => import('@/pages/application').then((m) => ({ Component: m.ApplicationSigningPage })),
                      },
                    ],
                  },
                ],
              },
            ],
          },
          // Рабочее место сотрудника банка
          {
            element: <RequireRole allow={['officer']} />,
            children: [
              {
                element: <BankLayout />,
                children: [
                  { path: ROUTES.bank.root, element: <Navigate to={ROUTES.bank.queue} replace /> },
                  {
                    path: ROUTES.bank.queue,
                    lazy: () => import('@/pages/bank-queue').then((m) => ({ Component: m.BankQueuePage })),
                  },
                  {
                    path: ROUTE_PATTERNS.bankApplication,
                    lazy: () => import('@/pages/bank-application').then((m) => ({ Component: m.BankApplicationPage })),
                  },
                ],
              },
            ],
          },
        ],
      },

      // Витрина UI-kit (без авторизации; перед релизом можно скрыть)
      {
        path: ROUTES.uiKit,
        lazy: () => import('@/pages/ui-kit').then((m) => ({ Component: m.UiKitPage })),
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

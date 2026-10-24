import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '@/entities/user';
import { useAuth } from '@/features/auth';
import { Skeleton } from '@/shared/ui';
import { getHomePath, ROUTES } from './paths';
import styles from './guards.module.css';

/** Заглушка на время проверки сессии и первой загрузки чанка страницы. */
export function PageLoader() {
  return (
    <div className={styles.loader} aria-busy="true" aria-label="Загрузка">
      <Skeleton height={56} />
      <Skeleton height={240} />
    </div>
  );
}

/** Защита от open-redirect: принимаем только внутренние пути. */
function safeFrom(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : null;
}

/** Пускает только авторизованных. Остальных отправляет на /login, запомнив, куда они шли. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') {
    return (
      <Navigate to={ROUTES.login} replace state={{ from: location.pathname + location.search }} />
    );
  }
  return <Outlet />;
}

/** Пускает только указанные роли. Чужаков отправляет на их «домашнюю» страницу. */
export function RequireRole({ allow }: { allow: readonly UserRole[] }) {
  const { user } = useAuth();

  if (!user) return null; // сюда без RequireAuth не попасть, это страховка для типов
  if (!allow.includes(user.role)) return <Navigate to={getHomePath(user.role)} replace />;
  return <Outlet />;
}

/** Страница только для гостей (логин). Авторизованных уводит на нужную страницу. */
export function GuestOnly() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader />;
  if (user) return <Navigate to={safeFrom(location.state) ?? getHomePath(user.role)} replace />;
  return <Outlet />;
}

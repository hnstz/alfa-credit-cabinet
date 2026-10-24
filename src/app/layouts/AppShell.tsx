import { Link, NavLink, Outlet, useNavigate, useNavigation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { cx } from '@/shared/lib/cx';
import { Button } from '@/shared/ui';
import { getHomePath, ROUTES } from '../router/paths';
import styles from './AppShell.module.css';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

interface AppShellProps {
  title: string;
  nav: NavItem[];
}

/** Общий каркас: шапка с навигацией и пользователем + область страницы. */
export function AppShell({ title, nav }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Идёт переход на страницу, чей код ещё грузится (lazy-маршрут)
  const navigating = useNavigation().state !== 'idle';

  async function handleLogout() {
    await logout();
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        {navigating && <div className={styles.progress} role="progressbar" aria-label="Загрузка страницы" />}
        <div className={styles.inner}>
          <Link to={user ? getHomePath(user.role) : ROUTES.login} className={styles.brand}>
            <span className={styles.logo} aria-hidden="true">А</span>
            {title}
          </Link>

          <nav className={styles.nav} aria-label="Основная навигация">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cx(styles.link, isActive && styles.active)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className={styles.user}>
              <div className={styles.userInfo}>
                <strong>{user.fullName}</strong>
                <span>{user.company?.name ?? user.position}</span>
              </div>
              <Button size="s" variant="secondary" onClick={handleLogout}>
                Выйти
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

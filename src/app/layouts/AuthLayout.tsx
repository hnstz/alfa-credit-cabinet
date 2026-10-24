import { Outlet } from 'react-router-dom';
import { Card } from '@/shared/ui';
import styles from './AuthLayout.module.css';

export function AuthLayout() {
  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">А</span>
          Кредиты для бизнеса
        </div>
        <Card padding="l">
          <Outlet />
        </Card>
      </div>
    </div>
  );
}

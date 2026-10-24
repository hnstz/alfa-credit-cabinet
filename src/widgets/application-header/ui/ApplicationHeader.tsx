import { Link } from 'react-router-dom';
import { PRODUCTS, StatusBadge } from '@/entities/application';
import type { ClientApplication } from '@/entities/application';
import { LiveIndicator } from '@/features/track-application';
import { ROUTES } from '@/shared/config/routes';
import { formatMoney, formatMonths } from '@/shared/lib/format';
import { ArrowLeftIcon } from '@/shared/ui/icons';
import styles from './ApplicationHeader.module.css';

interface ApplicationHeaderProps {
  application: ClientApplication;
  /** Скрыть крупный заголовок (когда он есть ниже, например на экране решения). */
  compact?: boolean;
}

/** Шапка экранов заявки: назад, номер, сумма, статус и индикатор автообновления. */
export function ApplicationHeader({ application, compact = false }: ApplicationHeaderProps) {
  return (
    <header className={styles.header}>
      <Link to={ROUTES.client.home} className={styles.back}>
        <ArrowLeftIcon size={16} /> Мои заявки
      </Link>
      <div className={styles.row}>
        <div className={styles.titleBlock}>
          {!compact && <h1 className={styles.title}>Заявка № {application.number}</h1>}
          <p className={styles.meta}>
            {compact && <>Заявка № {application.number} · </>}
            {PRODUCTS[application.product].title} · {formatMoney(application.amount)} на {formatMonths(application.termMonths)}
          </p>
        </div>
        <div className={styles.status}>
          <StatusBadge status={application.status} />
          <LiveIndicator />
        </div>
      </div>
    </header>
  );
}

import { formatRelative } from '@/shared/lib/format';
import { useNow } from '@/shared/lib/hooks';
import { cx } from '@/shared/lib/cx';
import { useTrackedApplication } from '../../model/useTrackedApplication';
import styles from './LiveIndicator.module.css';

/** «● Обновляется автоматически · только что» — чтобы было понятно, что страницу не надо перезагружать. */
export function LiveIndicator() {
  const { isLive, lastUpdated, error } = useTrackedApplication();
  const now = useNow(5_000);

  if (error && lastUpdated) {
    return (
      <span className={cx(styles.indicator, styles.offline)} role="status">
        <span className={styles.dot} aria-hidden="true" />
        Нет связи — повторим через несколько секунд
      </span>
    );
  }

  return (
    <span className={cx(styles.indicator, isLive && styles.live)} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {isLive ? 'Статус обновляется автоматически' : 'Статус актуален'}
      {lastUpdated && (
        <span className={styles.time}> · {formatRelative(new Date(lastUpdated).toISOString(), now)}</span>
      )}
    </span>
  );
}

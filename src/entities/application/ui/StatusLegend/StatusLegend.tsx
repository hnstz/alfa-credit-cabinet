import { APPLICATION_STATUSES, getStatusMeta } from '../../model/status';
import type { StatusActor, StatusAudience } from '../../model/status';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './StatusLegend.module.css';

const ACTOR_LABEL: Record<StatusAudience, Record<Exclude<StatusActor, null>, string>> = {
  client: { client: 'Ваш ход', bank: 'Ход банка', system: 'Автоматически' },
  bank: { client: 'Ждём клиента', bank: 'Ход банка', system: 'Автоматически' },
};

/** Справочник всех статусов: для проверки формулировок с продактом и как документация. */
export function StatusLegend({ audience }: { audience: StatusAudience }) {
  return (
    <ul className={styles.list}>
      {APPLICATION_STATUSES.map((status) => {
        const meta = getStatusMeta(status);
        const text = meta.text[audience];
        return (
          <li key={status} className={styles.item}>
            <div className={styles.badge}>
              <StatusBadge status={status} audience={audience} />
            </div>
            <div className={styles.body}>
              <span>{text.description}</span>
              {text.nextAction && <span className={styles.next}>→ {text.nextAction}</span>}
            </div>
            <code className={styles.code}>{status}</code>
            <span className={styles.actor}>{meta.actor ? ACTOR_LABEL[audience][meta.actor] : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

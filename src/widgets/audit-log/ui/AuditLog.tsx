import { useState } from 'react';
import type { ReactNode } from 'react';
import { getStatusText } from '@/entities/application';
import type { ActorType, AuditEntry } from '@/entities/application';
import { cx } from '@/shared/lib/cx';
import { formatDateTime } from '@/shared/lib/format';
import { SegmentedControl } from '@/shared/ui';
import { BriefcaseIcon, CpuIcon, UserIcon } from '@/shared/ui/icons';
import styles from './AuditLog.module.css';

const ACTOR_ICON: Record<ActorType, ReactNode> = {
  client: <UserIcon size={16} />,
  system: <CpuIcon size={16} />,
  officer: <BriefcaseIcon size={16} />,
};

/** Технические шаги конвейера прячем в фильтре «Ключевые события». */
const PIPELINE_ACTOR = 'Кредитный конвейер';

const ACTOR_LABEL: Record<ActorType, string> = {
  client: 'Клиент',
  system: 'Система',
  officer: 'Сотрудник',
};

type Filter = 'all' | 'decisions';

/** История по заявке: кто, когда, на каком этапе и почему. Новые события сверху. */
export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = [...entries]
    .reverse()
    .filter((e) => filter === 'all' || e.actor.name !== PIPELINE_ACTOR);

  return (
    <div className={styles.log}>
      <SegmentedControl
        size="s"
        fullWidth={false}
        options={[
          { value: 'all', label: `Все события (${entries.length})` },
          { value: 'decisions', label: 'Ключевые события' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <ol className={styles.list}>
        {visible.map((e) => {
          return (
            <li key={e.id} className={styles.item}>
              <span className={cx(styles.icon, styles[`icon_${e.actor.type}`])} aria-hidden="true">
                {ACTOR_ICON[e.actor.type]}
              </span>
              <div className={styles.body}>
                <div className={styles.meta}>
                  <strong>{e.actor.name}</strong>
                  <span className={styles.role}>{ACTOR_LABEL[e.actor.type]}</span>
                  <span className={styles.stage}>этап: {getStatusText(e.stage, 'bank').label}</span>
                  <time className={styles.time} dateTime={e.at}>
                    {formatDateTime(e.at)}
                  </time>
                </div>
                <p className={styles.action}>{e.action}</p>
                {e.comment && <blockquote className={styles.comment}>{e.comment}</blockquote>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { useState } from 'react';
import type { FeedItem } from '@/entities/feed';
import { getErrorMessage } from '@/shared/api';
import { useNow } from '@/shared/lib/hooks';
import { Alert, Button, SegmentedControl, Skeleton } from '@/shared/ui';
import { OfferFeedCard, StatusFeedCard, TipFeedCard } from './FeedCards';
import styles from './NewsFeed.module.css';

type FeedFilter = 'ALL' | FeedItem['type'];

const FILTERS = [
  { value: 'ALL', label: 'Всё' },
  { value: 'APPLICATION_STATUS', label: 'Заявки' },
  { value: 'OFFER', label: 'Предложения' },
  { value: 'TIP', label: 'Советы' },
] as const;

interface NewsFeedProps {
  items: FeedItem[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

/** Персональная лента: статусы заявок, предложения и советы по оборотам. */
export function NewsFeed({ items, loading, error, onRetry }: NewsFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>('ALL');
  const now = useNow(30_000);
  const visible = (items ?? []).filter((i) => filter === 'ALL' || i.type === filter);

  return (
    <section className={styles.feed} aria-labelledby="feed-title">
      <header className={styles.header}>
        <h2 id="feed-title" className={styles.heading}>
          Лента
        </h2>
        <SegmentedControl
          size="s"
          fullWidth={false}
          options={FILTERS}
          value={filter}
          onChange={(v) => setFilter(v)}
        />
      </header>

      {error !== undefined && !items && (
        <Alert
          tone="danger"
          title="Не удалось загрузить ленту"
          action={
            <Button size="s" variant="secondary" onClick={onRetry}>
              Повторить
            </Button>
          }
        >
          {getErrorMessage(error)}
        </Alert>
      )}

      {loading && (
        <div className={styles.list} aria-busy="true" aria-label="Загружаем ленту">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={148} />
          ))}
        </div>
      )}

      {items && (
        <div className={styles.list}>
          {visible.length === 0 && <p className={styles.empty}>Здесь пока пусто.</p>}
          {visible.map((item) => {
            switch (item.type) {
              case 'APPLICATION_STATUS':
                return <StatusFeedCard key={item.id} item={item} now={now} />;
              case 'OFFER':
                return <OfferFeedCard key={item.id} item={item} />;
              case 'TIP':
                return <TipFeedCard key={item.id} item={item} />;
            }
          })}
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { bannerApi, canShowBanner, readBannerShows, registerBannerShow, resetBannerShows } from '@/entities/banner';
import type { BannerShowcase as BannerShowcaseData } from '@/entities/banner';
import { useAuth } from '@/features/auth';
import { config } from '@/shared/config';
import { Skeleton } from '@/shared/ui';
import { BannerCard } from './BannerCard';
import styles from './BannerShowcase.module.css';

const DISMISS_KEY = 'alfa-credit:dismissed-banners';
const SLOTS = 3;

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(ids));
  } catch {
    /* sessionStorage недоступен — закрытие живёт до перезагрузки */
  }
}

interface BannerShowcaseProps {
  showcase: BannerShowcaseData | undefined;
  loading: boolean;
}

/**
 * Витрина над сводкой (GET /client/banners): один персональный баннер — его выбирает модель —
 * и два классических. Правило показа в entities/banner/model/shows.ts: после 4 показов без реакции
 * баннер скрывается, клик по кнопке обнуляет счётчик. События VIEW / CLICK / DISMISS уходят на сервер.
 */
export function BannerShowcase({ showcase, loading }: BannerShowcaseProps) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  // Счётчики на момент открытия дашборда: по ним решаем, что показать. Баннер, засчитанный
  // в этот заход, не пропадёт на глазах, когда дашборд перезапросит витрину.
  const [shows] = useState(() => readBannerShows(userId));
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const counted = useRef(new Set<string>());

  const banners = showcase ? [showcase.personal, ...showcase.classic].filter((b) => b !== null) : [];
  const visible = banners.filter((b) => canShowBanner(shows[b.id] ?? 0) && !dismissed.includes(b.id));
  const visibleIds = visible.map((b) => b.id).join('\n');

  // Показ считаем один раз на id за заход, даже если дашборд перезапрашивает витрину
  useEffect(() => {
    for (const id of visibleIds.split('\n')) {
      if (!id || counted.current.has(id)) continue;
      counted.current.add(id);
      registerBannerShow(userId, id);
      void bannerApi.track(id, 'VIEW');
    }
  }, [visibleIds, userId]);

  if (loading) {
    return (
      <div className={styles.showcase} aria-busy="true" aria-label="Загружаем предложения">
        {Array.from({ length: SLOTS }, (_, i) => (
          <Skeleton key={i} height={248} className={styles.skeleton} />
        ))}
      </div>
    );
  }
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
    void bannerApi.track(id, 'DISMISS');
  };

  const react = (id: string) => {
    resetBannerShows(userId, id);
    void bannerApi.track(id, 'CLICK');
  };

  return (
    <section
      className={styles.showcase}
      style={{ '--banners': visible.length } as CSSProperties}
      aria-label="Предложения банка"
    >
      {visible.map((b) => (
        <BannerCard
          key={b.id}
          banner={b}
          personal={b.id === showcase?.personal?.id}
          showNumber={config.showBannerCounters ? (shows[b.id] ?? 0) + 1 : undefined}
          onCta={() => react(b.id)}
          onDismiss={() => dismiss(b.id)}
        />
      ))}
    </section>
  );
}

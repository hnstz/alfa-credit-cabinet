import { useEffect, useRef, useState } from 'react';
import { bannerApi } from '@/entities/banner';
import type { PersonalBanner as PersonalBannerData } from '@/entities/banner';
import { cx } from '@/shared/lib/cx';
import { formatDayMonth } from '@/shared/lib/format';
import { ButtonLink, Skeleton } from '@/shared/ui';
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, CloseIcon, InfoIcon } from '@/shared/ui/icons';
import { ctaTarget } from '../lib/ctaTarget';
import styles from './PersonalBanner.module.css';

const DISMISS_KEY = 'alfa-credit:dismissed-banners';

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

interface PersonalBannerProps {
  banner: PersonalBannerData | undefined;
  loading: boolean;
}

/**
 * Персональный баннер: что показать выбирает модель (GET /client/banner).
 * Шлёт события VIEW / CLICK / DISMISS — по ним модель можно дообучать.
 */
export function PersonalBanner({ banner, loading }: PersonalBannerProps) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [whyOpen, setWhyOpen] = useState(false);
  const viewed = useRef<string | null>(null);

  const bannerId = banner?.id;
  const hidden = bannerId !== undefined && dismissed.includes(bannerId);

  // Показ считаем один раз на id, даже если дашборд перезапрашивает баннер
  useEffect(() => {
    if (!bannerId || hidden || viewed.current === bannerId) return;
    viewed.current = bannerId;
    void bannerApi.track(bannerId, 'VIEW');
  }, [bannerId, hidden]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Загружаем персональное предложение">
        <Skeleton height={168} />
      </div>
    );
  }
  if (!banner || hidden) return null;

  const target = banner.cta ? ctaTarget(banner.cta) : null;

  const dismiss = () => {
    const next = [...dismissed, banner.id];
    setDismissed(next);
    writeDismissed(next);
    void bannerApi.track(banner.id, 'DISMISS');
  };

  return (
    <section className={cx(styles.banner, styles[`theme_${banner.theme}`])} aria-label="Персональное предложение">
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Скрыть баннер">
        <CloseIcon size={16} />
      </button>

      <div className={styles.main}>
        {banner.badge && <span className={styles.badge}>{banner.badge}</span>}
        <h2 className={styles.title}>{banner.title}</h2>
        <p className={styles.text}>{banner.text}</p>

        {banner.perks.length > 0 && (
          <ul className={styles.perks}>
            {banner.perks.map((perk) => (
              <li key={perk} className={styles.perk}>
                <CheckIcon size={14} />
                {perk}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          {banner.cta && target && (
            <ButtonLink
              to={target}
              size="m"
              variant={banner.theme === 'brand' || banner.theme === 'dark' ? 'secondary' : 'primary'}
              rightIcon={<ArrowRightIcon size={16} />}
              onClick={() => void bannerApi.track(banner.id, 'CLICK')}
            >
              {banner.cta.label}
            </ButtonLink>
          )}
          {banner.validUntil && <span className={styles.until}>Действует до {formatDayMonth(banner.validUntil)}</span>}
          {banner.reasons.length > 0 && (
            <button
              type="button"
              className={styles.why}
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              aria-controls="banner-why"
            >
              <InfoIcon size={14} />
              Почему я это вижу
              <ChevronDownIcon size={14} className={cx(styles.chevron, whyOpen && styles.chevronOpen)} />
            </button>
          )}
        </div>

        {whyOpen && (
          <ul id="banner-why" className={styles.reasons}>
            {banner.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {banner.highlight && (
        <div className={styles.highlight}>
          <strong className={styles.highlightValue}>{banner.highlight.value}</strong>
          {banner.highlight.caption && <span className={styles.highlightCaption}>{banner.highlight.caption}</span>}
        </div>
      )}
    </section>
  );
}

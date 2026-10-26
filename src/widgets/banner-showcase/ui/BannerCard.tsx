import { useId, useState } from 'react';
import { MAX_SHOWS_WITHOUT_REACTION } from '@/entities/banner';
import type { PersonalBanner } from '@/entities/banner';
import { cx } from '@/shared/lib/cx';
import { formatDayMonth } from '@/shared/lib/format';
import { ButtonLink } from '@/shared/ui';
import type { ButtonVariant } from '@/shared/ui';
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, CloseIcon, InfoIcon } from '@/shared/ui/icons';
import { ctaTarget } from '../lib/ctaTarget';
import styles from './BannerCard.module.css';

/** В узкой карточке помещаются две короткие выгоды. */
const MAX_PERKS = 2;

interface BannerCardProps {
  banner: PersonalBanner;
  /** Персональный баннер: модель объясняет выбор в блоке «Почему я это вижу». */
  personal: boolean;
  /** Номер текущего показа без реакции — демо-подпись. Не задан — подписи нет. */
  showNumber?: number;
  /** Клик по кнопке — реакция на баннер. */
  onCta: () => void;
  onDismiss: () => void;
}

/** На ярком фоне — светлая кнопка, на светлом — фирменная. У классических — контурная, чтобы не спорить с персональным. */
function ctaVariant(banner: PersonalBanner, personal: boolean): ButtonVariant {
  if (!personal) return 'outline';
  return banner.theme === 'brand' || banner.theme === 'dark' ? 'secondary' : 'primary';
}

/** Карточка витрины: персональный или классический баннер. */
export function BannerCard({ banner, personal, showNumber, onCta, onDismiss }: BannerCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const target = banner.cta ? ctaTarget(banner.cta) : null;
  const canExplain = personal && banner.reasons.length > 0;

  return (
    <article
      className={cx(styles.card, styles[`theme_${banner.theme}`])}
      aria-label={personal ? 'Персональное предложение' : 'Предложение банка'}
    >
      <div className={styles.head}>
        {banner.badge ? <span className={styles.badge}>{banner.badge}</span> : <span />}
        <button type="button" className={styles.close} onClick={onDismiss} aria-label={`Скрыть баннер «${banner.title}»`}>
          <CloseIcon size={16} />
        </button>
      </div>

      <h2 className={styles.title}>{banner.title}</h2>
      <p className={styles.text}>{banner.text}</p>

      {banner.perks.length > 0 && (
        <ul className={styles.perks}>
          {banner.perks.slice(0, MAX_PERKS).map((perk) => (
            <li key={perk} className={styles.perk}>
              <CheckIcon size={14} />
              {perk}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.footer}>
        {banner.highlight && (
          <p className={styles.highlight}>
            <strong className={styles.highlightValue}>{banner.highlight.value}</strong>
            {banner.highlight.caption && <span className={styles.highlightCaption}>{banner.highlight.caption}</span>}
          </p>
        )}

        <div className={styles.actions}>
          {banner.cta && target && (
            <ButtonLink
              to={target}
              size="s"
              variant={ctaVariant(banner, personal)}
              rightIcon={<ArrowRightIcon size={16} />}
              onClick={onCta}
            >
              {banner.cta.label}
            </ButtonLink>
          )}
          {canExplain && (
            <button
              type="button"
              className={styles.why}
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              aria-controls={whyId}
            >
              <InfoIcon size={14} />
              Почему я это вижу
              <ChevronDownIcon size={14} className={cx(styles.chevron, whyOpen && styles.chevronOpen)} />
            </button>
          )}
        </div>

        {whyOpen && (
          <ul id={whyId} className={styles.reasons}>
            {banner.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        {banner.validUntil && <span className={styles.note}>Действует до {formatDayMonth(banner.validUntil)}</span>}
        {showNumber !== undefined && (
          <span
            className={styles.shows}
            title={`После ${MAX_SHOWS_WITHOUT_REACTION} показов без реакции баннер скрывается, клик по кнопке обнуляет счётчик`}
          >
            Показов без реакции: {showNumber} из {MAX_SHOWS_WITHOUT_REACTION}
          </span>
        )}
      </div>
    </article>
  );
}

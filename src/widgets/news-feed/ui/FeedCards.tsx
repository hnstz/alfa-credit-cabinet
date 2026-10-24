import { getStatusMeta, PRODUCTS, StatusBadge } from '@/entities/application';
import type { ApplicationStatusFeedItem, OfferFeedItem, TipFeedItem } from '@/entities/feed';
import { cx } from '@/shared/lib/cx';
import {
  formatDayMonth,
  formatMoneyShort,
  formatMonth,
  formatMonths,
  formatPercent,
  formatRelative,
} from '@/shared/lib/format';
import { BarChart, Badge, ButtonLink } from '@/shared/ui';
import { ArrowRightIcon, GiftIcon, LightbulbIcon, TrendDownIcon, TrendUpIcon } from '@/shared/ui/icons';
import { offerLink, statusCardLink } from '../lib/links';
import styles from './NewsFeed.module.css';

/** 1. Статус заявки — что происходит и что нажать. */
export function StatusFeedCard({ item, now }: { item: ApplicationStatusFeedItem; now: number }) {
  const link = statusCardLink(item);
  const tone = getStatusMeta(item.status).tone;

  return (
    <article className={cx(styles.card, styles.statusCard, styles[`accent_${tone}`])}>
      <div className={styles.cardTop}>
        <StatusBadge status={item.status} size="s" />
        <span className={styles.time}>
          {item.applicationNumber ? `№ ${item.applicationNumber} · ` : ''}
          {formatRelative(item.createdAt, now)}
        </span>
      </div>
      <h3 className={styles.title}>{item.title}</h3>
      <p className={styles.text}>{item.text}</p>
      <div className={styles.actions}>
        <ButtonLink
          to={link.to}
          size="s"
          variant={item.actionRequired ? 'primary' : 'secondary'}
          rightIcon={<ArrowRightIcon size={16} />}
        >
          {link.label}
        </ButtonLink>
      </div>
    </article>
  );
}

/** 2. Персональное предложение — рассчитано заранее по данным клиента. */
export function OfferFeedCard({ item }: { item: OfferFeedItem }) {
  return (
    <article className={cx(styles.card, styles.offerCard)}>
      <div className={styles.cardTop}>
        <Badge tone="brand" size="s">
          <GiftIcon size={14} /> Персональное предложение
        </Badge>
        <span className={styles.time}>до {formatDayMonth(item.validUntil)}</span>
      </div>
      <h3 className={styles.title}>{item.title}</h3>
      <p className={styles.text}>{item.text}</p>
      <dl className={styles.offerFacts}>
        <div>
          <dt>Сумма</dt>
          <dd>до {formatMoneyShort(item.offer.amount)}</dd>
        </div>
        <div>
          <dt>Срок</dt>
          <dd>{formatMonths(item.offer.termMonths)}</dd>
        </div>
        <div>
          <dt>Ставка</dt>
          <dd>от {formatPercent(item.offer.ratePercent)}</dd>
        </div>
      </dl>
      <ul className={styles.perks}>
        {item.perks.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className={styles.actions}>
        <ButtonLink to={offerLink(item)} size="s" rightIcon={<ArrowRightIcon size={16} />}>
          Оформить
        </ButtonLink>
        <span className={styles.offerProduct}>{PRODUCTS[item.offer.product].title}</span>
      </div>
    </article>
  );
}

const TIP_ICON = {
  positive: <TrendUpIcon size={18} />,
  warning: <TrendDownIcon size={18} />,
  neutral: <LightbulbIcon size={18} />,
} as const;

/** 3. Совет на основе динамики оборотов по счёту. */
export function TipFeedCard({ item }: { item: TipFeedItem }) {
  return (
    <article className={cx(styles.card, styles.tipCard)}>
      <div className={styles.cardTop}>
        <span className={cx(styles.tipIcon, styles[`tip_${item.tone}`])} aria-hidden="true">
          {TIP_ICON[item.tone]}
        </span>
        <span className={styles.tipKind}>Совет по вашим оборотам</span>
        {item.highlight && <strong className={cx(styles.highlight, styles[`tip_${item.tone}`])}>{item.highlight}</strong>}
      </div>
      <h3 className={styles.title}>{item.title}</h3>
      <p className={styles.text}>{item.text}</p>
      {item.series && item.series.length > 0 && (
        <BarChart
          className={styles.chart}
          title={item.seriesLabel ?? 'Поступления по месяцам'}
          seriesLabel={item.seriesLabel ?? 'Поступления'}
          highlightLabel={item.flaggedLabel}
          data={item.series.map((p) => ({
            key: p.month,
            label: formatMonth(p.month),
            value: p.value,
            highlighted: p.flagged,
          }))}
          formatValue={formatMoneyShort}
          height={84}
          allLabels={item.series.length <= 8}
        />
      )}
    </article>
  );
}

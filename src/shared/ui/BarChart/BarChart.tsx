import { useState } from 'react';
import { cx } from '@/shared/lib/cx';
import styles from './BarChart.module.css';

export interface BarDatum {
  key: string;
  /** Подпись под столбцом (месяц и т.п.). */
  label: string;
  value: number;
  /** Вторая серия — тонкая отметка поверх столбца (например, расходы). */
  marker?: number;
  /** Выделить столбец (например, месяц с кассовым разрывом). */
  highlighted?: boolean;
}

export interface BarChartProps {
  data: BarDatum[];
  /** Подпись для скринридеров и заголовок таблицы. */
  title: string;
  formatValue: (value: number) => string;
  seriesLabel: string;
  markerLabel?: string;
  highlightLabel?: string;
  height?: number;
  /** Показывать подписи под каждым столбцом (иначе — только первый и последний). */
  allLabels?: boolean;
  className?: string;
}

/**
 * Небольшой столбчатый график без библиотек: CSS-флекс + подсказка при наведении/фокусе.
 * Цвет никогда не единственный носитель смысла: есть легенда и скрытая таблица с данными.
 */
export function BarChart({
  data,
  title,
  formatValue,
  seriesLabel,
  markerLabel,
  highlightLabel,
  height = 120,
  allLabels = true,
  className,
}: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.marker ?? 0)));
  const hasMarker = data.some((d) => d.marker !== undefined);
  const hasHighlight = data.some((d) => d.highlighted);
  const activeDatum = active !== null ? data[active] : undefined;

  return (
    <figure className={cx(styles.figure, className)}>
      <div className={styles.plot} style={{ height }} onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <div
            key={d.key}
            className={styles.column}
            tabIndex={0}
            aria-label={`${d.label}: ${formatValue(d.value)}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <span
              className={cx(styles.bar, d.highlighted && styles.highlighted, active === i && styles.activeBar)}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
            {d.marker !== undefined && (
              <span className={styles.marker} style={{ bottom: `${(d.marker / max) * 100}%` }} />
            )}
          </div>
        ))}

        {activeDatum && active !== null && (
          <div
            className={styles.tooltip}
            role="status"
            style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
          >
            <strong>{activeDatum.label}</strong>
            <span>
              <i className={styles.swatch} /> {seriesLabel}: {formatValue(activeDatum.value)}
            </span>
            {activeDatum.marker !== undefined && markerLabel && (
              <span>
                <i className={cx(styles.swatch, styles.swatchMarker)} /> {markerLabel}: {formatValue(activeDatum.marker)}
              </span>
            )}
            {activeDatum.highlighted && highlightLabel && <span className={styles.flag}>{highlightLabel}</span>}
          </div>
        )}
      </div>

      <div className={styles.axis} aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.key} className={styles.tick}>
            {allLabels || i === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>

      {(hasMarker || hasHighlight) && (
        <figcaption className={styles.legend}>
          <span>
            <i className={cx(styles.swatch, hasHighlight && !hasMarker && styles.swatchMuted)} /> {seriesLabel}
          </span>
          {hasMarker && markerLabel && (
            <span>
              <i className={cx(styles.swatch, styles.swatchMarker)} /> {markerLabel}
            </span>
          )}
          {hasHighlight && highlightLabel && (
            <span>
              <i className={cx(styles.swatch, styles.swatchHighlight)} /> {highlightLabel}
            </span>
          )}
        </figcaption>
      )}

      <table className={styles.srOnly}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Период</th>
            <th scope="col">{seriesLabel}</th>
            {hasMarker && <th scope="col">{markerLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>
                {formatValue(d.value)}
                {d.highlighted && highlightLabel ? ` (${highlightLabel})` : ''}
              </td>
              {hasMarker && <td>{d.marker !== undefined ? formatValue(d.marker) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

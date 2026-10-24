import type { CSSProperties } from 'react';
import { cx } from '@/shared/lib/cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle';
  width?: number | string;
  height?: number | string;
  /** Для variant="text": сколько строк нарисовать. */
  lines?: number;
  className?: string;
}

const toCss = (v: number | string | undefined) => (typeof v === 'number' ? `${v}px` : v);

/** Заглушка на время загрузки. Родителю добавьте aria-busy="true". */
export function Skeleton({ variant = 'rect', width, height, lines = 1, className }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div className={cx(styles.lines, className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={cx(styles.skeleton, styles.text)}
            style={{ width: i === lines - 1 ? '60%' : toCss(width) }}
          />
        ))}
      </div>
    );
  }

  const style: CSSProperties = { width: toCss(width), height: toCss(height) };
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, styles[variant], className)}
      style={style}
    />
  );
}

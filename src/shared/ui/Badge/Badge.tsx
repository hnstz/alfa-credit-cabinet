import type { HTMLAttributes } from 'react';
import { cx } from '@/shared/lib/cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 's' | 'm';
  /** Цветная точка слева — удобно для статусов. */
  dot?: boolean;
}

export function Badge({
  tone = 'neutral',
  size = 'm',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], styles[`size_${size}`], className)} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

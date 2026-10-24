import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import styles from './Card.module.css';

export type CardPadding = 'none' | 's' | 'm' | 'l';
export type CardVariant = 'elevated' | 'outlined' | 'filled';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
  variant?: CardVariant;
  padding?: CardPadding;
  /** Hover-эффект для кликабельных карточек (каталог продуктов и т.п.). */
  interactive?: boolean;
}

export function Card({
  as: Tag = 'div',
  variant = 'elevated',
  padding = 'm',
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        styles.card,
        styles[variant],
        styles[`padding_${padding}`],
        interactive && styles.interactive,
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(styles.header, className)}>
      <h3 className={styles.title}>{title}</h3>
      {action}
    </div>
  );
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.footer, className)} {...rest} />;
}

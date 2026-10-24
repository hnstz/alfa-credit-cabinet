import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import { AlertIcon, CheckCircleIcon, InfoIcon } from '../icons';
import styles from './Alert.module.css';

export type AlertTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
  /** Своя иконка; false — без иконки. */
  icon?: ReactNode | false;
  /** Кнопка/ссылка справа. */
  action?: ReactNode;
}

const DEFAULT_ICON: Record<AlertTone, ReactNode> = {
  neutral: <InfoIcon />,
  info: <InfoIcon />,
  success: <CheckCircleIcon />,
  warning: <AlertIcon />,
  danger: <AlertIcon />,
};

/** Плашка-сообщение: подсказка, предупреждение, результат действия. */
export function Alert({ tone = 'info', title, icon, action, className, children, ...rest }: AlertProps) {
  const iconNode = icon === false ? null : (icon ?? DEFAULT_ICON[tone]);

  return (
    <div className={cx(styles.alert, styles[tone], className)} {...rest}>
      {iconNode && <span className={styles.icon}>{iconNode}</span>}
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.text}>{children}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

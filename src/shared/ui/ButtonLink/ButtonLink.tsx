import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import type { ButtonVariant } from '../Button';
import type { ControlSize } from '../types';
import styles from '../Button/Button.module.css';

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ControlSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/** Ссылка, которая выглядит как кнопка: для переходов (а не действий) используем <a>. */
export function ButtonLink({
  variant = 'primary',
  size = 'm',
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cx(styles.button, styles[variant], styles[`size_${size}`], fullWidth && styles.full, className)}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}

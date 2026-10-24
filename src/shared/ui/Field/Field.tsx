import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import styles from './Field.module.css';

export interface FieldProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

/** Общая обёртка полей формы: подпись + контрол + подсказка/ошибка. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  fullWidth = true,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx(styles.field, fullWidth && styles.full, className)}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              {' '}*
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className={cx(styles.message, styles.error)} aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={styles.message}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

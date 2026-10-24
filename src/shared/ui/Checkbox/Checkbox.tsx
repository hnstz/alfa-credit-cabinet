import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import { CheckIcon } from '../icons';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: ReactNode;
  /** Пояснение под подписью. */
  description?: ReactNode;
  error?: ReactNode;
}

/** Нативный чекбокс со своей отрисовкой: клавиатура и скринридеры работают как обычно. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id: idProp, label, description, error, className, disabled, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  return (
    <div className={cx(styles.wrapper, className)}>
      <label className={cx(styles.checkbox, disabled && styles.disabled, !!error && styles.invalid)} htmlFor={id}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className={styles.input}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...rest}
        />
        <span className={styles.box} aria-hidden="true">
          <CheckIcon size={14} strokeWidth={3} />
        </span>
        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {description && <span className={styles.description}>{description}</span>}
        </span>
      </label>
      {error && (
        <p id={`${id}-error`} className={styles.error} aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
});

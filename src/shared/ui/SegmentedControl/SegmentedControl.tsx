import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  options: readonly SegmentedOption<V>[];
  /** '' — ничего не выбрано. */
  value: V | '';
  onChange: (value: V) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: 's' | 'm';
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Переключатель «одно из нескольких» на нативных radio: стрелки и Tab работают из коробки. */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
  hint,
  error,
  size = 'm',
  fullWidth = true,
  disabled = false,
  className,
}: SegmentedControlProps<V>) {
  const name = useId();
  const labelId = `${name}-label`;
  const messageId = error ? `${name}-error` : hint ? `${name}-hint` : undefined;

  return (
    <div className={cx(styles.field, className)}>
      {label && (
        <span id={labelId} className={styles.label}>
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={messageId}
        aria-invalid={error ? true : undefined}
        className={cx(styles.group, styles[`size_${size}`], fullWidth && styles.full, !!error && styles.invalid)}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              styles.option,
              value === option.value && styles.selected,
              (disabled || option.disabled) && styles.disabled,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={disabled || option.disabled}
              onChange={() => onChange(option.value)}
              className={styles.input}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${name}-error`} className={cx(styles.message, styles.error)} aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className={styles.message}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

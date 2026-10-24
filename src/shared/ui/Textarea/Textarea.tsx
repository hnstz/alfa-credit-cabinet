import { forwardRef, useId } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from '@/shared/lib/cx';
import { Field, getDescribedBy } from '../Field';
import control from '../Field/control.module.css';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fullWidth?: boolean;
  /** Показать счётчик «12 / 500» (нужен maxLength). */
  showCounter?: boolean;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    id: idProp,
    label,
    hint,
    error,
    fullWidth = true,
    showCounter = false,
    wrapperClassName,
    className,
    disabled,
    required,
    maxLength,
    value,
    rows = 4,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const length = typeof value === 'string' ? value.length : 0;

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      fullWidth={fullWidth}
      className={wrapperClassName}
    >
      <div
        className={cx(
          control.control,
          styles.control,
          !!error && control.invalid,
          disabled && control.disabled,
        )}
      >
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={cx(control.input, styles.textarea, className)}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescribedBy(id, hint, error)}
          {...rest}
        />
      </div>
      {showCounter && maxLength !== undefined && (
        <span className={styles.counter} aria-hidden="true">
          {length} / {maxLength}
        </span>
      )}
    </Field>
  );
});

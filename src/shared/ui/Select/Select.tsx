import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from '@/shared/lib/cx';
import type { ControlSize } from '../types';
import { Field, getDescribedBy } from '../Field';
import { ChevronDownIcon } from '../icons';
import control from '../Field/control.module.css';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'> {
  options: SelectOption[];
  /** Текст-подсказка, пока ничего не выбрано (значение ''). */
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: ControlSize;
  fullWidth?: boolean;
  wrapperClassName?: string;
}

/** Нативный <select> в стиле кита: доступный из коробки и удобный на мобильных. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id: idProp,
    options,
    placeholder,
    label,
    hint,
    error,
    size = 'm',
    fullWidth = true,
    wrapperClassName,
    className,
    disabled,
    required,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;

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
          control[`size_${size}`],
          !!error && control.invalid,
          disabled && control.disabled,
        )}
      >
        <select
          ref={ref}
          id={id}
          className={cx(control.input, styles.select, className)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescribedBy(id, hint, error)}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron}>
          <ChevronDownIcon size={20} />
        </span>
      </div>
    </Field>
  );
});

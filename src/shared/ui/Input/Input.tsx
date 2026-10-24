import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import type { ControlSize } from '../types';
import { Field, getDescribedBy } from '../Field';
import control from '../Field/control.module.css';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: ReactNode;
  hint?: ReactNode;
  /** Текст ошибки. Если задан — поле подсвечивается красным. */
  error?: ReactNode;
  size?: ControlSize;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  fullWidth?: boolean;
  /** Класс внешней обёртки (подпись + поле + сообщение). */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id: idProp,
    label,
    hint,
    error,
    size = 'm',
    startAdornment,
    endAdornment,
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
        {startAdornment && <span className={control.adornment}>{startAdornment}</span>}
        <input
          ref={ref}
          id={id}
          className={cx(control.input, className)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescribedBy(id, hint, error)}
          {...rest}
        />
        {endAdornment && <span className={control.adornment}>{endAdornment}</span>}
      </div>
    </Field>
  );
});

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { mergeRefs } from '@/shared/lib/mergeRefs';
import { formatNumber, parseDigits } from '@/shared/lib/format';
import { Input } from '../Input';
import type { InputProps } from '../Input';

export interface MoneyInputProps
  extends Omit<
    InputProps,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode' | 'endAdornment'
  > {
  /** Значение в рублях (целое число) или null, если поле пустое. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Верхняя граница суммы. */
  max?: number;
  currency?: string;
}

/** Позиция курсора после форматирования: сразу за n-й цифрой. */
function caretAfterDigits(text: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i] ?? '')) {
      seen += 1;
      if (seen === digits) return i + 1;
    }
  }
  return text.length;
}

/**
 * Поле суммы: "1500000" -> "1 500 000 ₽".
 * Управляемое: наружу отдаёт number | null, а не строку.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, max = 999_999_999_999, currency = '₽', onKeyDown, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [, forceRender] = useState(0);

  const text = value === null ? '' : formatNumber(value);

  // После форматирования возвращаем курсор туда, где он был относительно цифр.
  useLayoutEffect(() => {
    const el = innerRef.current;
    const caret = caretRef.current;
    if (el && caret !== null) {
      el.setSelectionRange(caret, caret);
      caretRef.current = null;
    }
  });

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.currentTarget.value;
    const selection = e.currentTarget.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, selection).replace(/\D/g, '').length;

    let next = parseDigits(raw);
    if (next !== null && next > max) next = max;

    const nextText = next === null ? '' : formatNumber(next);
    caretRef.current = caretAfterDigits(nextText, digitsBeforeCaret);

    if (next === value) forceRender((n) => n + 1);
    else onChange(next);
  }

  // Backspace/Delete рядом с пробелом-разделителем просто перепрыгивает через него.
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;

    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart ?? 0;
    const index = e.key === 'Backspace' ? pos - 1 : pos;
    const char = el.value[index];

    if (char && /\D/.test(char)) {
      e.preventDefault();
      const nextPos = e.key === 'Backspace' ? pos - 1 : pos + 1;
      el.setSelectionRange(nextPos, nextPos);
    }
  }

  return (
    <Input
      {...rest}
      ref={mergeRefs(ref, innerRef)}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      endAdornment={<span aria-hidden="true">{currency}</span>}
    />
  );
});

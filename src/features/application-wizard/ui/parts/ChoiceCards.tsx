import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import { CheckIcon } from '@/shared/ui/icons';
import styles from '../Wizard.module.css';

export interface ChoiceCardOption<V extends string> {
  value: V;
  title: string;
  description?: ReactNode;
}

interface ChoiceCardsProps<V extends string> {
  label: string;
  options: readonly ChoiceCardOption<V>[];
  value: V | '';
  onChange: (value: V) => void;
  error?: string;
}

/** Выбор карточкой (вид кредита). Внутри — нативные radio. */
export function ChoiceCards<V extends string>({ label, options, value, onChange, error }: ChoiceCardsProps<V>) {
  const name = useId();

  return (
    <fieldset className={styles.choiceField}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.choiceGrid}>
        {options.map((o) => (
          <label key={o.value} className={cx(styles.choice, value === o.value && styles.choiceSelected, !!error && styles.choiceInvalid)}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className={styles.choiceInput}
              aria-invalid={error ? true : undefined}
            />
            <span className={styles.choiceCheck} aria-hidden="true">
              <CheckIcon size={14} strokeWidth={3} />
            </span>
            <span className={styles.choiceTitle}>{o.title}</span>
            {o.description && <span className={styles.choiceDescription}>{o.description}</span>}
          </label>
        ))}
      </div>
      {error && (
        <p className={styles.error} aria-live="polite">
          {error}
        </p>
      )}
    </fieldset>
  );
}

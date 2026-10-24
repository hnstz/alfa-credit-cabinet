import { cx } from '@/shared/lib/cx';
import { CheckIcon } from '../icons';
import styles from './Stepper.module.css';

export interface StepperStep {
  id: string;
  title: string;
  description?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Индекс текущего шага (с нуля). */
  currentIndex: number;
  /** Если передан — завершённые шаги становятся кликабельными (вернуться назад). */
  onStepClick?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, currentIndex, onStepClick, className }: StepperProps) {
  return (
    <ol className={cx(styles.stepper, className)} aria-label="Шаги заявки">
      {steps.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
        const clickable = state === 'done' && !!onStepClick;

        const marker = (
          <span className={styles.marker} aria-hidden="true">
            {state === 'done' ? <CheckIcon size={16} /> : index + 1}
          </span>
        );
        const text = (
          <span className={styles.text}>
            <span className={styles.title}>{step.title}</span>
            {step.description && <span className={styles.description}>{step.description}</span>}
          </span>
        );

        return (
          <li
            key={step.id}
            className={cx(styles.step, styles[state])}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {clickable ? (
              <button type="button" className={styles.content} onClick={() => onStepClick(index)}>
                {marker}
                {text}
              </button>
            ) : (
              <div className={styles.content}>
                {marker}
                {text}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

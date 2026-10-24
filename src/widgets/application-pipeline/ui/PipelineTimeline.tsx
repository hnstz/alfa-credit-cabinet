import { getPipelineIndex, hasDecision, PIPELINE_STAGES } from '@/entities/application';
import type { ClientApplication, DecisionKind } from '@/entities/application';
import { cx } from '@/shared/lib/cx';
import { formatTime } from '@/shared/lib/format';
import { CheckIcon, SpinnerIcon } from '@/shared/ui/icons';
import styles from './PipelineTimeline.module.css';

type StageState = 'done' | 'current' | 'upcoming';

/** Бережные формулировки: даже отказ — «решение готово», подробности на экране решения. */
const DECISION_TITLE: Record<DecisionKind, string> = {
  APPROVED: 'Решение: одобрено',
  COUNTER_OFFER: 'Решение: есть предложение',
  REJECTED: 'Решение готово',
};

interface PipelineTimelineProps {
  application: ClientApplication;
  now: number;
}

/**
 * Этапы NEW -> DATA_CHECK -> ENRICHMENT -> SCORING -> DECISION
 * с подсказкой «что происходит» и «что делать» для текущего этапа.
 */
export function PipelineTimeline({ application, now }: PipelineTimelineProps) {
  const currentIndex = getPipelineIndex(application.status);
  const decided = hasDecision(application.status);
  const etaSeconds = application.stageEta
    ? Math.max(1, Math.round((new Date(application.stageEta).getTime() - now) / 1000))
    : null;

  return (
    <ol className={styles.timeline} aria-label="Этапы рассмотрения заявки">
      {PIPELINE_STAGES.map((stage, index) => {
        const isDecisionStage = stage.id === 'DECISION';
        const state: StageState =
          index < currentIndex || (isDecisionStage && decided)
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'upcoming';
        const startedAt = application.history.find((h) =>
          (stage.statuses as readonly string[]).includes(h.status),
        )?.at;

        const title =
          isDecisionStage && decided ? DECISION_TITLE[application.decision?.kind ?? 'REJECTED'] : stage.title;

        return (
          <li
            key={stage.id}
            className={cx(styles.stage, styles[state])}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {state === 'done' ? (
                <CheckIcon size={14} strokeWidth={3} />
              ) : state === 'current' ? (
                <SpinnerIcon size={16} className={styles.spin} />
              ) : (
                index + 1
              )}
            </span>
            <div className={styles.body}>
              <div className={styles.row}>
                <span className={styles.title}>{title}</span>
                {startedAt && state !== 'upcoming' && <time className={styles.time}>{formatTime(startedAt)}</time>}
              </div>
              {state === 'current' && (
                <div className={styles.current}>
                  <p className={styles.active}>
                    {stage.active}
                    {etaSeconds !== null && etaSeconds < 120 && (
                      <span className={styles.eta}> · ещё ~{etaSeconds} сек.</span>
                    )}
                  </p>
                  <p className={styles.hint}>{stage.hint}</p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

import { useState } from 'react';
import {
  bankApplicationApi,
  DECISION_LABEL,
  DECISION_RESULT_LABEL,
  DECISION_TONE,
  getStatusText,
  REJECT_REASON_LABEL,
} from '@/entities/application';
import type {
  BankApplication,
  BankDecisionRequest,
  DecisionKind,
  LoanTerms,
  RejectReasonCode,
} from '@/entities/application';
import { getErrorMessage } from '@/shared/api';
import { annuityPayment } from '@/shared/lib/finance';
import { cx } from '@/shared/lib/cx';
import { formatDateTime, formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { Alert, Badge, Button, Input, Modal, MoneyInput, SegmentedControl, Select, Textarea } from '@/shared/ui';
import { CpuIcon, PenIcon } from '@/shared/ui/icons';
import styles from './DecisionConsole.module.css';

const DECISIONS: DecisionKind[] = ['APPROVED', 'COUNTER_OFFER', 'REJECTED'];
const TERM_OPTIONS = [6, 12, 18, 24, 36, 48, 60].map((t) => ({ value: String(t), label: formatMonths(t) }));
const REASON_OPTIONS = (Object.keys(REJECT_REASON_LABEL) as RejectReasonCode[]).map((value) => ({
  value,
  label: REJECT_REASON_LABEL[value],
}));
/** Минимальная длина обоснования ручного решения. */
const MIN_REASON = 20;

function TermsLine({ terms }: { terms: LoanTerms }) {
  return (
    <dl className={styles.terms}>
      <div>
        <dt>Сумма</dt>
        <dd>{formatMoney(terms.amount)}</dd>
      </div>
      <div>
        <dt>Срок</dt>
        <dd>{formatMonths(terms.termMonths)}</dd>
      </div>
      <div>
        <dt>Ставка</dt>
        <dd>{formatPercent(terms.ratePercent)}</dd>
      </div>
      <div>
        <dt>Платёж</dt>
        <dd>{formatMoney(terms.monthlyPayment)}</dd>
      </div>
    </dl>
  );
}

/** Принятое решение — только чтение (после решения или для заявок вне очереди). */
function DecisionSummary({ application }: { application: BankApplication }) {
  const d = application.decision;
  if (!d) {
    return (
      <Alert tone="info" title="Решение пока недоступно">
        Заявка на этапе «{getStatusText(application.status, 'bank').label}». Консоль откроется после скоринга.
      </Alert>
    );
  }
  return (
    <div className={styles.summary}>
      <div className={styles.summaryHead}>
        <Badge tone={DECISION_TONE[d.decision]} dot>
          {DECISION_RESULT_LABEL[d.decision]}
        </Badge>
        {d.isOverride && (
          <Badge tone="warning" size="s">
            Ручное изменение
          </Badge>
        )}
      </div>
      <p className={styles.muted}>
        {d.decidedBy.name} · {formatDateTime(d.decidedAt)}
        {d.recommended && ` · рекомендация системы: ${DECISION_RESULT_LABEL[d.recommended].toLowerCase()}`}
      </p>
      {d.terms && <TermsLine terms={d.terms} />}
      {d.rejectReason && <p>Причина: {REJECT_REASON_LABEL[d.rejectReason]}</p>}
      {d.comment && <blockquote className={styles.quote}>{d.comment}</blockquote>}
      <p className={styles.muted}>Сейчас: {getStatusText(application.status, 'bank').description}</p>
    </div>
  );
}

interface DecisionConsoleProps {
  application: BankApplication;
  onDecided: (application: BankApplication) => void;
}

/**
 * Консоль решения: рекомендация ML-движка + «согласиться» или ручной override.
 * При override причина обязательна — она попадает в audit-log.
 */
export function DecisionConsole({ application, onDecided }: DecisionConsoleProps) {
  const rec = application.scoring?.recommendation ?? null;
  const rate = application.scoring?.ratePercent ?? 20;
  const requested = {
    amount: application.form.loan.amount ?? 0,
    termMonths: application.form.loan.termMonths ?? 12,
  };

  const [mode, setMode] = useState<'agree' | 'override'>('agree');
  const [decision, setDecision] = useState<DecisionKind>(rec?.decision ?? 'APPROVED');
  const [amount, setAmount] = useState<number | null>(rec?.terms?.amount ?? requested.amount);
  const [term, setTerm] = useState(String(rec?.terms?.termMonths ?? requested.termMonths));
  const [rateText, setRateText] = useState(String(rec?.terms?.ratePercent ?? rate).replace('.', ','));
  const [rejectReason, setRejectReason] = useState<RejectReasonCode | ''>(rec?.rejectReason ?? '');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (application.status !== 'UNDER_REVIEW' || !rec) {
    return (
      <div className={styles.console}>
        <h3 className={styles.title}>Решение</h3>
        <DecisionSummary application={application} />
      </div>
    );
  }

  const rateValue = Number(rateText.replace(',', '.'));
  const needsTerms = mode === 'override' && decision !== 'REJECTED';
  const overrideTerms: LoanTerms | null =
    needsTerms && amount && rateValue > 0
      ? { amount, termMonths: Number(term), ratePercent: rateValue, monthlyPayment: annuityPayment(amount, rateValue, Number(term)) }
      : null;

  const errors: Record<string, string> = {};
  if (mode === 'override') {
    if (needsTerms && (!amount || amount < 100_000)) errors.amount = 'Не меньше 100 000 ₽';
    if (needsTerms && !(rateValue > 0 && rateValue <= 60)) errors.rate = 'От 0,1 до 60 %';
    if (decision === 'REJECTED' && !rejectReason) errors.reason = 'Выберите причину отказа';
    if (comment.trim().length < MIN_REASON) errors.comment = `Опишите причину — не короче ${MIN_REASON} символов`;
  }
  const valid = Object.keys(errors).length === 0;

  const request: BankDecisionRequest =
    mode === 'agree'
      ? {
          decision: rec.decision,
          terms: rec.terms ?? undefined,
          rejectReason: rec.rejectReason ?? undefined,
          comment: comment.trim(),
        }
      : {
          decision,
          terms: overrideTerms ?? undefined,
          rejectReason: decision === 'REJECTED' && rejectReason ? rejectReason : undefined,
          comment: comment.trim(),
        };

  function startConfirm() {
    setTouched(true);
    if (valid) setConfirming(true);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      onDecided(await bankApplicationApi.decide(application.id, request));
      setConfirming(false);
    } catch (e) {
      setError(getErrorMessage(e));
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  const show = (key: string) => (touched ? errors[key] : undefined);

  return (
    <div className={styles.console}>
      <h3 className={styles.title}>Консоль решения</h3>

      <section className={styles.recommendation} aria-labelledby="rec-title">
        <div className={styles.recHead}>
          <CpuIcon size={18} />
          <span id="rec-title">Рекомендация системы</span>
          <Badge tone={DECISION_TONE[rec.decision]} dot>
            {DECISION_RESULT_LABEL[rec.decision]}
          </Badge>
        </div>
        {rec.terms && <TermsLine terms={rec.terms} />}
        {rec.rejectReason && <p className={styles.reason}>{REJECT_REASON_LABEL[rec.rejectReason]}</p>}
        <ul className={styles.rationale}>
          {rec.rationale.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className={styles.muted}>{rec.routeReason}</p>
      </section>

      <SegmentedControl
        options={[
          { value: 'agree', label: 'Согласиться' },
          { value: 'override', label: 'Изменить решение' },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setTouched(false);
        }}
      />

      {mode === 'override' && (
        <div className={styles.override}>
          <Alert tone="warning" icon={<PenIcon size={18} />}>
            Ручное решение отличается от рекомендации модели. Обоснование обязательно и попадёт в историю заявки.
          </Alert>
          <SegmentedControl
            label="Ваше решение"
            size="s"
            options={DECISIONS.map((d) => ({ value: d, label: DECISION_LABEL[d] }))}
            value={decision}
            onChange={setDecision}
          />
          {needsTerms && (
            <div className={styles.termsForm}>
              <MoneyInput label="Сумма" size="s" value={amount} onChange={setAmount} error={show('amount')} />
              <Select label="Срок" size="s" options={TERM_OPTIONS} value={term} onChange={(e) => setTerm(e.target.value)} />
              <Input
                label="Ставка, %"
                size="s"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
                error={show('rate')}
              />
              {overrideTerms && (
                <p className={styles.payment}>
                  Платёж ≈ <strong>{formatMoney(overrideTerms.monthlyPayment)}</strong> в месяц
                  {rec.maxAffordableAmount > 0 && overrideTerms.amount > rec.maxAffordableAmount && (
                    <span className={styles.warn}> · выше посильной суммы {formatMoney(rec.maxAffordableAmount)}</span>
                  )}
                </p>
              )}
            </div>
          )}
          {decision === 'REJECTED' && (
            <Select
              label="Причина отказа"
              size="s"
              placeholder="Выберите причину"
              options={REASON_OPTIONS}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value as RejectReasonCode)}
              error={show('reason')}
            />
          )}
        </div>
      )}

      <Textarea
        label={mode === 'override' ? 'Причина ручного решения' : 'Комментарий (необязательно)'}
        placeholder={
          mode === 'override'
            ? 'Например: выявлены судебные споры с поставщиками, не учтённые моделью'
            : 'Например: подтвердил обороты по выписке'
        }
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        error={show('comment')}
        required={mode === 'override'}
        maxLength={500}
        showCounter
        rows={3}
      />

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      <Button
        size="l"
        fullWidth
        variant={mode === 'override' ? 'outline' : 'primary'}
        className={cx(mode === 'override' && styles.overrideButton)}
        onClick={startConfirm}
      >
        {mode === 'agree' ? `Подтвердить: ${DECISION_LABEL[rec.decision].toLowerCase()}` : 'Принять ручное решение'}
      </Button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="s"
        closeOnBackdrop={false}
        title="Подтвердите решение"
        description="Клиент сразу увидит решение в кабинете."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
            <Button onClick={confirm} loading={pending}>
              Подтвердить
            </Button>
          </>
        }
      >
        <div className={styles.confirm}>
          <Badge tone={DECISION_TONE[request.decision]} dot>
            {DECISION_RESULT_LABEL[request.decision]}
          </Badge>
          {mode === 'override' && (
            <Badge tone="warning" size="s">
              Ручное изменение рекомендации
            </Badge>
          )}
          {request.terms && <TermsLine terms={request.terms} />}
          {request.rejectReason && <p>Причина: {REJECT_REASON_LABEL[request.rejectReason]}</p>}
          {request.comment && <blockquote className={styles.quote}>{request.comment}</blockquote>}
        </div>
      </Modal>
    </div>
  );
}

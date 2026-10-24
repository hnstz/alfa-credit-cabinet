import { useState } from 'react';
import { PRODUCTS } from '@/entities/application';
import { annuityPayment } from '@/shared/lib/finance';
import { formatMoney, formatMonths, formatPercent, formatTime } from '@/shared/lib/format';
import { cx } from '@/shared/lib/cx';
import { Button, Card, Modal } from '@/shared/ui';
import { AlertIcon, CheckCircleIcon, SpinnerIcon } from '@/shared/ui/icons';
import { useWizard } from '../../model/useWizard';
import styles from '../Wizard.module.css';

function SaveIndicator() {
  const { state, retrySave } = useWizard();
  const dirty = state.revision !== state.savedRevision;

  if (state.saveState === 'error') {
    return (
      <p className={cx(styles.save, styles.saveError)} role="status">
        <AlertIcon size={16} /> Не удалось сохранить — повторим сами
        <button type="button" className={styles.linkButton} onClick={retrySave}>
          Сейчас
        </button>
      </p>
    );
  }
  if (state.saveState === 'saving' || dirty) {
    return (
      <p className={styles.save} role="status">
        <SpinnerIcon size={16} className={styles.spin} /> Сохраняем…
      </p>
    );
  }
  return (
    <p className={cx(styles.save, styles.saveOk)} role="status">
      <CheckCircleIcon size={16} /> Черновик сохранён{state.savedAt ? ` в ${formatTime(state.savedAt)}` : ''}
    </p>
  );
}

/** Правая колонка мастера: что клиент просит, примерный платёж и статус автосохранения. */
export function WizardAside() {
  const { form, restart } = useWizard();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { product, amount, termMonths } = form.loan;
  const info = product ? PRODUCTS[product] : null;
  const payment = info && amount && termMonths ? annuityPayment(amount, info.rateFrom, termMonths) : null;

  return (
    <div className={styles.aside}>
      <Card padding="m">
        <p className={styles.asideLabel}>Ваша заявка</p>
        <p className={styles.asideProduct}>{info?.title ?? 'Вид кредита не выбран'}</p>
        <p className={styles.asideAmount}>{amount ? formatMoney(amount) : '—'}</p>
        <p className={styles.asideMeta}>{termMonths ? `на ${formatMonths(termMonths)}` : 'срок не выбран'}</p>

        {payment && info && (
          <div className={styles.payment}>
            <span>Примерный платёж</span>
            <strong>≈ {formatMoney(payment)} в месяц</strong>
            <span className={styles.note}>
              При ставке от {formatPercent(info.rateFrom)} годовых. Точные условия — после проверки заявки.
            </span>
          </div>
        )}

        <SaveIndicator />
      </Card>

      <p className={styles.note}>
        Можно закрыть страницу — анкета сохранится, и вы продолжите с того же места.
      </p>
      <Button variant="ghost" size="s" onClick={() => setConfirmRestart(true)}>
        Начать анкету заново
      </Button>

      <Modal
        open={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        size="s"
        title="Начать заново?"
        description="Введённые данные удалятся. Реквизиты и обороты мы снова подставим из данных банка."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRestart(false)}>
              Отмена
            </Button>
            <Button
              loading={restarting}
              onClick={async () => {
                setRestarting(true);
                await restart();
              }}
            >
              Начать заново
            </Button>
          </>
        }
      />
    </div>
  );
}

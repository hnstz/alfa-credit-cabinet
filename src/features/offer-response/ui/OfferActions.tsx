import { useState } from 'react';
import { applicationApi } from '@/entities/application';
import type { ClientApplication } from '@/entities/application';
import { getErrorMessage } from '@/shared/api';
import { Alert, Button, Modal, Select } from '@/shared/ui';
import styles from './OfferActions.module.css';

const DECLINE_REASONS = [
  { value: 'Условия не подходят', label: 'Условия не подходят' },
  { value: 'Нашли деньги в другом месте', label: 'Нашли деньги в другом месте' },
  { value: 'Кредит уже не нужен', label: 'Кредит уже не нужен' },
  { value: 'Другое', label: 'Другое' },
];

interface OfferActionsProps {
  applicationId: string;
  acceptLabel: string;
  /** Ответ сервера после принятия/отказа. */
  onUpdated: (application: ClientApplication, action: 'accepted' | 'declined') => void;
}

/** Кнопки «принять / отказаться» для одобрения и встречного предложения. */
export function OfferActions({ applicationId, acceptLabel, onUpdated }: OfferActionsProps) {
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function accept() {
    setPending('accept');
    setError(null);
    try {
      onUpdated(await applicationApi.acceptOffer(applicationId), 'accepted');
    } catch (e) {
      setError(getErrorMessage(e));
      setPending(null);
    }
  }

  async function decline() {
    setPending('decline');
    setError(null);
    try {
      const application = await applicationApi.declineOffer(applicationId, reason);
      setDeclineOpen(false);
      onUpdated(application, 'declined');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.wrapper}>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <div className={styles.buttons}>
        <Button size="l" onClick={accept} loading={pending === 'accept'} disabled={pending !== null}>
          {acceptLabel}
        </Button>
        <Button size="l" variant="secondary" onClick={() => setDeclineOpen(true)} disabled={pending !== null}>
          Отказаться
        </Button>
      </div>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        size="s"
        title="Отказаться от предложения?"
        description="Предложение перестанет действовать. Подать новую заявку можно в любой момент — анкета заполнится сама."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Не отказываться
            </Button>
            <Button variant="danger" onClick={decline} loading={pending === 'decline'}>
              Отказаться
            </Button>
          </>
        }
      >
        <Select
          label="Подскажите причину (необязательно)"
          placeholder="Выберите причину"
          options={DECLINE_REASONS}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

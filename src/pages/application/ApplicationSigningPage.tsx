import type { ReactNode } from 'react';
import { SigningFlow } from '@/features/sign-documents';
import { useTrackedApplication } from '@/features/track-application';
import { ROUTES } from '@/shared/config/routes';
import { formatDayMonth, formatMoney } from '@/shared/lib/format';
import { Alert, ButtonLink, Card, CardHeader } from '@/shared/ui';
import { CheckCircleIcon, SpinnerIcon } from '@/shared/ui/icons';
import { ApplicationHeader } from '@/widgets/application-header';
import { addMonths } from './dates';
import styles from './ApplicationPages.module.css';

function Waiting({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padding="l" className={styles.waiting} aria-live="polite">
      <SpinnerIcon size={32} className={styles.spin} />
      <h2 className={styles.waitingTitle}>{title}</h2>
      <p className={styles.muted}>{children}</p>
    </Card>
  );
}

/** Мок-экран оформления: подготовка документов -> подписание -> выдача. */
export function ApplicationSigningPage() {
  const { application, replace } = useTrackedApplication();
  if (!application) return null;

  const terms = application.decision && application.decision.kind !== 'REJECTED' ? application.decision.offer : null;
  const { status } = application;

  let content: ReactNode;
  if (status === 'APPROVED' || status === 'COUNTER_OFFER') {
    content = (
      <Alert
        tone="info"
        title="Сначала примите предложение"
        action={
          <ButtonLink to={ROUTES.client.decision(application.id)} size="s">
            К условиям
          </ButtonLink>
        }
      >
        После этого мы подготовим документы для подписания.
      </Alert>
    );
  } else if (status === 'OFFER_ACCEPTED') {
    content = <Waiting title="Готовим документы">Это займёт несколько секунд — страница обновится сама.</Waiting>;
  } else if (status === 'SIGNING' && terms) {
    content = (
      <Card padding="l">
        <CardHeader title="Подписание документов" />
        <SigningFlow application={application} terms={terms} onSigned={replace} />
      </Card>
    );
  } else if (status === 'SIGNED') {
    content = <Waiting title="Документы подписаны">Перечисляем деньги на ваш расчётный счёт.</Waiting>;
  } else if (status === 'DISBURSED' && terms) {
    const disbursedAt = application.history.find((h) => h.status === 'DISBURSED')?.at ?? application.updatedAt;
    content = (
      <Card padding="l" className={styles.success}>
        <span className={styles.successIcon} aria-hidden="true">
          <CheckCircleIcon size={40} />
        </span>
        <h2 className={styles.successTitle}>Деньги на счёте</h2>
        <p className={styles.successAmount}>{formatMoney(terms.amount)}</p>
        <p className={styles.muted}>
          Зачислили на расчётный счёт {formatDayMonth(disbursedAt)}. Первый платёж —{' '}
          {formatDayMonth(addMonths(disbursedAt, 1))}, {formatMoney(terms.monthlyPayment)}.
        </p>
        <p className={styles.note}>Демо-режим: выдача смоделирована, реальные деньги не перечисляются.</p>
        <ButtonLink to={ROUTES.client.home} size="l">
          На главную
        </ButtonLink>
      </Card>
    );
  } else {
    content = (
      <Alert
        tone="neutral"
        title="Оформление недоступно"
        action={
          <ButtonLink to={ROUTES.client.application(application.id)} size="s" variant="secondary">
            Статус заявки
          </ButtonLink>
        }
      >
        По этой заявке нет документов для подписания.
      </Alert>
    );
  }

  return (
    <div className={styles.page}>
      <ApplicationHeader application={application} />
      {content}
    </div>
  );
}

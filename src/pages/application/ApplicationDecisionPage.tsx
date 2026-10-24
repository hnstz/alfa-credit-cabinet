import { useNavigate } from 'react-router-dom';
import { isClosingStage } from '@/entities/application';
import type { ClientApplication } from '@/entities/application';
import { OfferActions } from '@/features/offer-response';
import { useTrackedApplication } from '@/features/track-application';
import { ROUTES } from '@/shared/config/routes';
import { Alert, ButtonLink } from '@/shared/ui';
import { ArrowRightIcon } from '@/shared/ui/icons';
import { ApplicationHeader } from '@/widgets/application-header';
import { ApprovedOutcome, CounterOfferOutcome, RejectedOutcome } from '@/widgets/decision-outcome';
import styles from './ApplicationPages.module.css';

/** Экран решения: одобрение, встречное предложение или отказ. */
export function ApplicationDecisionPage() {
  const { application, replace } = useTrackedApplication();
  const navigate = useNavigate();
  if (!application) return null;

  const { decision, status } = application;

  function handleUpdated(updated: ClientApplication, action: 'accepted' | 'declined') {
    replace(updated);
    if (action === 'accepted') navigate(ROUTES.client.signing(updated.id));
  }

  if (!decision) {
    return (
      <div className={styles.page}>
        <ApplicationHeader application={application} />
        <Alert
          tone="info"
          title="Решение ещё не готово"
          action={
            <ButtonLink to={ROUTES.client.application(application.id)} size="s" variant="secondary">
              Смотреть статус
            </ButtonLink>
          }
        >
          Мы сообщим, как только банк примет решение. Экран статуса обновляется автоматически.
        </Alert>
      </div>
    );
  }

  // Клиент уже ответил на предложение — показываем условия и куда идти дальше
  const responded = status === 'OFFER_DECLINED' || isClosingStage(status);
  const actions = responded ? (
    status === 'OFFER_DECLINED' ? (
      <Alert
        tone="neutral"
        title="Вы отказались от этого предложения"
        action={
          <ButtonLink to={ROUTES.client.newApplication} size="s" variant="secondary">
            Подать новую заявку
          </ButtonLink>
        }
      >
        Если передумаете — подайте новую заявку, анкета заполнится автоматически.
      </Alert>
    ) : (
      <Alert
        tone="success"
        title="Вы приняли предложение"
        action={
          <ButtonLink to={ROUTES.client.signing(application.id)} size="s" rightIcon={<ArrowRightIcon size={16} />}>
            К оформлению
          </ButtonLink>
        }
      >
        Осталось подписать документы онлайн.
      </Alert>
    )
  ) : null;

  return (
    <div className={styles.page}>
      <ApplicationHeader application={application} compact />

      {decision.kind === 'APPROVED' && (
        <ApprovedOutcome
          decision={decision}
          actions={
            actions ?? <OfferActions applicationId={application.id} acceptLabel="Оформить" onUpdated={handleUpdated} />
          }
        />
      )}
      {decision.kind === 'COUNTER_OFFER' && (
        <CounterOfferOutcome
          decision={decision}
          actions={
            actions ?? (
              <OfferActions applicationId={application.id} acceptLabel="Принять предложение" onUpdated={handleUpdated} />
            )
          }
        />
      )}
      {decision.kind === 'REJECTED' && <RejectedOutcome decision={decision} retryProduct={application.product} />}
    </div>
  );
}

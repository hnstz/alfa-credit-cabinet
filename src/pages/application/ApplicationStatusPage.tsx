import { getStatusText, hasDecision, isClosingStage, PRODUCTS, PURPOSE_LABEL } from '@/entities/application';
import { useTrackedApplication } from '@/features/track-application';
import { config } from '@/shared/config';
import { ROUTES } from '@/shared/config/routes';
import { formatDateTime, formatMoney, formatMonths } from '@/shared/lib/format';
import { useNow } from '@/shared/lib/hooks';
import { Alert, ButtonLink, Card, CardHeader } from '@/shared/ui';
import { ArrowRightIcon } from '@/shared/ui/icons';
import { ApplicationHeader } from '@/widgets/application-header';
import { PipelineTimeline } from '@/widgets/application-pipeline';
import styles from './ApplicationPages.module.css';

/** Экран статуса: этапы конвейера, что происходит сейчас и что делать дальше. */
export function ApplicationStatusPage() {
  const { application } = useTrackedApplication();
  const now = useNow(1_000);
  if (!application) return null;

  const text = getStatusText(application.status, 'client');
  const decided = hasDecision(application.status);
  const closing = isClosingStage(application.status);

  return (
    <div className={styles.page}>
      <ApplicationHeader application={application} />

      {decided && !closing && (
        <Alert
          tone={application.status === 'REJECTED' ? 'neutral' : 'success'}
          title="Решение по заявке готово"
          action={
            <ButtonLink to={ROUTES.client.decision(application.id)} size="s" rightIcon={<ArrowRightIcon size={16} />}>
              Посмотреть решение
            </ButtonLink>
          }
        >
          {text.description}
        </Alert>
      )}
      {closing && (
        <Alert
          tone="info"
          title={text.label}
          action={
            <ButtonLink to={ROUTES.client.signing(application.id)} size="s" rightIcon={<ArrowRightIcon size={16} />}>
              Перейти к оформлению
            </ButtonLink>
          }
        >
          {text.description}
        </Alert>
      )}

      <div className={styles.columns}>
        <Card padding="l">
          <CardHeader title="Как идёт рассмотрение" />
          <PipelineTimeline application={application} now={now} />
        </Card>

        <div className={styles.side}>
          <Card padding="m">
            <CardHeader title="Что дальше" />
            <p className={styles.lead}>{text.description}</p>
            {text.nextAction ? (
              <p className={styles.next}>
                <ArrowRightIcon size={16} /> {text.nextAction}
              </p>
            ) : (
              !decided && <p className={styles.muted}>От вас ничего не нужно — мы сообщим, когда будет решение.</p>
            )}
          </Card>

          <Card padding="m">
            <CardHeader title="Ваш запрос" />
            <dl className={styles.facts}>
              <div>
                <dt>Кредит</dt>
                <dd>{PRODUCTS[application.product].title}</dd>
              </div>
              <div>
                <dt>Сумма и срок</dt>
                <dd>
                  {formatMoney(application.amount)} на {formatMonths(application.termMonths)}
                </dd>
              </div>
              <div>
                <dt>Цель</dt>
                <dd>{PURPOSE_LABEL[application.purpose]}</dd>
              </div>
              <div>
                <dt>Отправлена</dt>
                <dd>{formatDateTime(application.submittedAt)}</dd>
              </div>
            </dl>
          </Card>

          {config.useMocks && application.status === 'UNDER_REVIEW' && (
            <Alert tone="neutral" title="Подсказка для демо">
              Заявки больше 1 000 000 ₽ решает сотрудник. Откройте соседнюю вкладку, войдите как{' '}
              <code>ivanova / demo1234</code> и примите решение — этот экран обновится сам.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

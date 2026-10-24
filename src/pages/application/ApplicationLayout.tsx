import { Outlet, useParams } from 'react-router-dom';
import { ApplicationTrackerProvider, useTrackedApplication } from '@/features/track-application';
import { getErrorMessage, isNotFound } from '@/shared/api';
import { ROUTES } from '@/shared/config/routes';
import { Alert, ButtonLink, Button, Skeleton } from '@/shared/ui';
import styles from './ApplicationPages.module.css';

function TrackedOutlet() {
  const { application, error, loading, refresh } = useTrackedApplication();

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Загружаем заявку">
        <Skeleton height={64} />
        <Skeleton height={320} />
      </div>
    );
  }
  if (!application) {
    return isNotFound(error) ? (
      <Alert
        tone="warning"
        title="Заявка не найдена"
        action={
          <ButtonLink to={ROUTES.client.home} size="s" variant="secondary">
            На главную
          </ButtonLink>
        }
      >
        Возможно, ссылка устарела или заявка принадлежит другой компании.
      </Alert>
    ) : (
      <Alert
        tone="danger"
        title="Не удалось загрузить заявку"
        action={
          <Button size="s" variant="secondary" onClick={refresh}>
            Повторить
          </Button>
        }
      >
        {getErrorMessage(error)}
      </Alert>
    );
  }
  return <Outlet />;
}

/**
 * Общий маршрут /applications/:id/*: один поллинг на все экраны заявки
 * (статус, решение, подписание) — при переходах между ними данные не теряются.
 */
export function ApplicationLayout() {
  const { id = '' } = useParams();
  return (
    <ApplicationTrackerProvider key={id} id={id}>
      <TrackedOutlet />
    </ApplicationTrackerProvider>
  );
}

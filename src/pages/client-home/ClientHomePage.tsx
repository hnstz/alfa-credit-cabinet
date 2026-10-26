import { Link } from 'react-router-dom';
import {
  applicationApi,
  getClientApplicationLink,
  getPipelineIndex,
  getStatusMeta,
  isFinalStatus,
  PIPELINE_STAGES,
  PRODUCTS,
  StatusBadge,
} from '@/entities/application';
import type { ApplicationSummary } from '@/entities/application';
import { bannerApi } from '@/entities/banner';
import { feedApi } from '@/entities/feed';
import { productApi, ProductList } from '@/entities/product';
import { useAuth } from '@/features/auth';
import { ROUTES } from '@/shared/config/routes';
import { cx } from '@/shared/lib/cx';
import { formatDayMonth, formatMoney, formatRelative } from '@/shared/lib/format';
import { useAutoReload, useNow, useRequest } from '@/shared/lib/hooks';
import { ButtonLink, Card, CardHeader, Skeleton } from '@/shared/ui';
import { ChevronRightIcon, PenIcon, PlusIcon } from '@/shared/ui/icons';
import { BannerShowcase } from '@/widgets/banner-showcase';
import { NewsFeed } from '@/widgets/news-feed';
import styles from './ClientHomePage.module.css';

/** Заявка ещё идёт по автоматическим этапам — дашборд обновляем чаще. */
const isMoving = (a: ApplicationSummary) => getStatusMeta(a.status).actor === 'system';

function ApplicationRow({ app, now }: { app: ApplicationSummary; now: number }) {
  const link = getClientApplicationLink(app.id, app.status);
  const stage = getPipelineIndex(app.status);

  return (
    <li>
      <Link to={link.to} className={styles.appRow}>
        <div className={styles.appMain}>
          <div className={styles.appTop}>
            <span className={styles.appNumber}>№ {app.number}</span>
            <StatusBadge status={app.status} size="s" />
          </div>
          <span className={styles.appTitle}>
            {formatMoney(app.amount)} · {PRODUCTS[app.product].title.toLowerCase()}
          </span>
          {stage >= 0 && !isFinalStatus(app.status) && (
            <span className={styles.progress} aria-label={`Этап ${stage + 1} из ${PIPELINE_STAGES.length}`}>
              {PIPELINE_STAGES.map((s, i) => (
                <span key={s.id} className={cx(styles.progressDot, i <= stage && styles.progressDone)} />
              ))}
            </span>
          )}
          <span className={styles.appMeta}>Обновлено {formatRelative(app.updatedAt, now)}</span>
        </div>
        <ChevronRightIcon size={18} className={styles.chevron} />
      </Link>
    </li>
  );
}

/** Дашборд клиента: сводка, заявки, продукты и персональная лента. */
export function ClientHomePage() {
  const { user } = useAuth();
  const company = user?.company;
  const firstName = user?.fullName.split(' ')[0];
  const now = useNow(15_000);

  const applications = useRequest('applications', (signal) => applicationApi.list(signal));
  const draft = useRequest('draft', (signal) => applicationApi.getDraftSummary(signal));
  const products = useRequest('products', (signal) => productApi.list(signal));
  const feed = useRequest('feed', (signal) => feedApi.list(signal));
  const banners = useRequest('banners', (signal) => bannerApi.showcase(signal));

  // Пока заявка идёт по конвейеру — обновляем часто, чтобы лента и статусы менялись на глазах
  const moving = applications.data?.some(isMoving) ?? false;
  useAutoReload(() => {
    applications.reload();
    feed.reload();
    banners.reload();
    products.reload();
    draft.reload();
  }, moving ? 4_000 : 20_000);

  const accounts = products.data?.filter((p) => p.kind === 'ACCOUNT') ?? [];
  const loans = products.data?.flatMap((p) => (p.kind === 'LOAN' ? [p] : [])) ?? [];
  const balance = accounts.reduce((s, a) => s + (a.kind === 'ACCOUNT' ? a.balance : 0), 0);
  const debt = loans.reduce((s, l) => s + l.debt, 0);
  const nextPayment = [...loans].sort((a, b) => a.nextPayment.date.localeCompare(b.nextPayment.date))[0];
  const active = applications.data?.filter((a) => !isFinalStatus(a.status)) ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Здравствуйте, {firstName}!</h1>
          {company && (
            <p className={styles.subtitle}>
              {company.name} · ИНН {company.inn}
            </p>
          )}
        </div>
        <ButtonLink to={ROUTES.client.newApplication} size="l" leftIcon={<PlusIcon size={18} />}>
          Новая заявка
        </ButtonLink>
      </header>

      <BannerShowcase showcase={banners.data} loading={banners.loading} />

      <section className={styles.kpis} aria-label="Сводка">
        <Card padding="m" className={styles.kpi}>
          <span className={styles.kpiLabel}>На счетах</span>
          {products.data ? <strong className={styles.kpiValue}>{formatMoney(balance)}</strong> : <Skeleton height={32} />}
        </Card>
        <Card padding="m" className={styles.kpi}>
          <span className={styles.kpiLabel}>Долг по кредитам</span>
          {products.data ? (
            <>
              <strong className={styles.kpiValue}>{formatMoney(debt)}</strong>
              {nextPayment && (
                <span className={styles.kpiHint}>
                  Платёж {formatDayMonth(nextPayment.nextPayment.date)} — {formatMoney(nextPayment.nextPayment.amount)}
                </span>
              )}
            </>
          ) : (
            <Skeleton height={32} />
          )}
        </Card>
        <Card padding="m" className={styles.kpi}>
          <span className={styles.kpiLabel}>Заявки в работе</span>
          {applications.data ? (
            <strong className={styles.kpiValue}>{active.length}</strong>
          ) : (
            <Skeleton height={32} />
          )}
        </Card>
      </section>

      <div className={styles.grid}>
        <NewsFeed
          items={feed.data}
          loading={feed.loading}
          error={feed.error}
          onRetry={feed.reload}
        />

        <aside className={styles.side}>
          {draft.data && (
            <Card padding="m" className={styles.draft}>
              <div className={styles.draftHead}>
                <PenIcon size={18} />
                <strong>Незаконченная заявка</strong>
              </div>
              <p className={styles.draftText}>
                Шаг {draft.data.step + 1} из {draft.data.totalSteps}
                {draft.data.amount ? ` · ${formatMoney(draft.data.amount)}` : ''} · сохранено{' '}
                {formatRelative(draft.data.updatedAt, now)}
              </p>
              <ButtonLink to={ROUTES.client.newApplication} size="s" variant="secondary">
                Продолжить заполнение
              </ButtonLink>
            </Card>
          )}

          <Card padding="m">
            <CardHeader title="Мои заявки" />
            {applications.loading && <Skeleton variant="text" lines={3} />}
            {applications.data && applications.data.length === 0 && (
              <p className={styles.empty}>Заявок пока нет. Подайте первую — это займёт около 5 минут.</p>
            )}
            {applications.data && applications.data.length > 0 && (
              <ul className={styles.apps}>
                {applications.data.map((a) => (
                  <ApplicationRow key={a.id} app={a} now={now} />
                ))}
              </ul>
            )}
          </Card>

          <Card padding="m">
            <CardHeader title="Мои продукты" />
            {products.loading ? <Skeleton variant="text" lines={3} /> : <ProductList products={products.data ?? []} />}
          </Card>
        </aside>
      </div>
    </div>
  );
}

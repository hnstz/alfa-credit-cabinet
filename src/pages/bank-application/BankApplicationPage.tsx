import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApplicationFormView,
  bankApplicationApi,
  getStatusMeta,
  LEGAL_FORM_LABEL,
  PRODUCTS,
  StatusBadge,
} from '@/entities/application';
import type { BankApplication } from '@/entities/application';
import { DecisionConsole } from '@/features/bank-decision';
import { getErrorMessage, isNotFound } from '@/shared/api';
import { ROUTES } from '@/shared/config/routes';
import { formatDateTime, formatDuration, formatMoney, formatMonths } from '@/shared/lib/format';
import { useAutoReload, useNow, useRequest } from '@/shared/lib/hooks';
import { Alert, Button, Card, CardHeader, Skeleton } from '@/shared/ui';
import { ArrowLeftIcon, SpinnerIcon } from '@/shared/ui/icons';
import { AuditLog } from '@/widgets/audit-log';
import { EnrichmentReport } from '@/widgets/enrichment-report';
import { ScoringReport } from '@/widgets/scoring-report';
import styles from './BankApplicationPage.module.css';

const SECTIONS = [
  { id: 'scoring', label: 'Скоринг' },
  { id: 'enrichment', label: 'Внешние данные' },
  { id: 'form', label: 'Анкета' },
  { id: 'audit', label: 'История' },
];

function Pending({ text }: { text: string }) {
  return (
    <p className={styles.pending}>
      <SpinnerIcon size={16} className={styles.spin} /> {text}
    </p>
  );
}

/** Карточка заявки для сотрудника: анкета, обогащение, скоринг с объяснимостью, решение и история. */
export function BankApplicationPage() {
  const { id = '' } = useParams();
  const now = useNow(30_000);
  const request = useRequest(`bank-application:${id}`, (signal) => bankApplicationApi.get(id, signal));
  // Ответ мутации показываем сразу, не дожидаясь следующего опроса
  const [override, setOverride] = useState<BankApplication | null>(null);
  const app =
    override && request.data && override.id === request.data.id && override.updatedAt > request.data.updatedAt
      ? override
      : request.data;

  // Пока заявка в автоматических этапах или у клиента — подтягиваем изменения
  const actor = app ? getStatusMeta(app.status).actor : null;
  useAutoReload(request.reload, actor === 'system' ? 2_000 : actor === 'client' ? 8_000 : null);

  if (request.loading) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Загружаем заявку">
        <Skeleton height={72} />
        <Skeleton height={420} />
      </div>
    );
  }
  if (!app) {
    return (
      <Alert
        tone={isNotFound(request.error) ? 'warning' : 'danger'}
        title={isNotFound(request.error) ? 'Заявка не найдена' : 'Не удалось загрузить заявку'}
        action={
          <Button size="s" variant="secondary" onClick={request.reload}>
            Повторить
          </Button>
        }
      >
        {getErrorMessage(request.error)}
      </Alert>
    );
  }

  const { form } = app;
  const waiting = now - new Date(app.submittedAt).getTime();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to={ROUTES.bank.queue} className={styles.back}>
          <ArrowLeftIcon size={16} /> Очередь заявок
        </Link>
        <div className={styles.headRow}>
          <div>
            <p className={styles.number}>Заявка № {app.number}</p>
            <h1 className={styles.title}>{form.company.name}</h1>
            <p className={styles.meta}>
              {LEGAL_FORM_LABEL[form.company.legalForm]} · ИНН {form.company.inn} · {PRODUCTS[app.product].title} ·{' '}
              <strong>{formatMoney(form.loan.amount ?? 0)}</strong> на {formatMonths(form.loan.termMonths ?? 0)}
            </p>
          </div>
          <div className={styles.headStatus}>
            <StatusBadge status={app.status} audience="bank" />
            <span className={styles.meta}>
              Поступила {formatDateTime(app.submittedAt)}
              {app.status === 'UNDER_REVIEW' && ` · ждёт ${formatDuration(waiting)}`}
            </span>
          </div>
        </div>
        <nav className={styles.anchors} aria-label="Разделы заявки">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card padding="l" as="section" id="scoring" aria-labelledby="scoring-title">
            <CardHeader title={<span id="scoring-title">Скоринг и объяснимость</span>} />
            {app.scoring ? <ScoringReport scoring={app.scoring} /> : <Pending text="Модель рассчитывает оценку…" />}
          </Card>

          <Card padding="l" as="section" id="enrichment" aria-labelledby="enrichment-title">
            <CardHeader title={<span id="enrichment-title">Внешние данные (обогащение)</span>} />
            {app.enrichment ? (
              <EnrichmentReport enrichment={app.enrichment} />
            ) : (
              <Pending text="Запрашиваем ЕГРЮЛ/ЕГРИП, НБКИ и ФНС…" />
            )}
          </Card>

          <Card padding="l" as="section" id="form" aria-labelledby="form-title">
            <CardHeader title={<span id="form-title">Анкета клиента</span>} />
            <ApplicationFormView form={form} columns={2} />
          </Card>

          <Card padding="l" as="section" id="audit" aria-labelledby="audit-title">
            <CardHeader title={<span id="audit-title">История по заявке (audit-log)</span>} />
            <AuditLog entries={app.audit} />
          </Card>
        </div>

        <aside className={styles.aside}>
          <Card padding="m">
            {/* key: при смене статуса (скоринг завершился) консоль пересоздаётся с новой рекомендацией */}
            <DecisionConsole
              key={app.status}
              application={app}
              onDecided={(updated) => {
                setOverride(updated);
                request.reload();
              }}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

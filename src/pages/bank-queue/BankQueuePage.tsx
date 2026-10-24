import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  bankApplicationApi,
  DECISION_RESULT_LABEL,
  DECISION_TONE,
  LEGAL_FORM_LABEL,
  PRODUCTS,
  RISK_LABEL,
  RISK_TONE,
  StatusBadge,
} from '@/entities/application';
import type { BankQueueFilters, BankQueueItem, QueueStatusFilter, RiskLevel } from '@/entities/application';
import { useAuth } from '@/features/auth';
import { getErrorMessage } from '@/shared/api';
import { ROUTES } from '@/shared/config/routes';
import { cx } from '@/shared/lib/cx';
import { formatDuration, formatMoney, formatMonths, formatRelative } from '@/shared/lib/format';
import { useAutoReload, useNow, useRequest } from '@/shared/lib/hooks';
import { Alert, Badge, Button, Card, Input, MoneyInput, SegmentedControl, Table } from '@/shared/ui';
import type { TableColumn, TableSort } from '@/shared/ui';
import { RefreshIcon, SearchIcon } from '@/shared/ui/icons';
import styles from './BankQueuePage.module.css';

const STATUS_FILTERS: { value: QueueStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'ACTION', label: 'Ждут решения' },
  { value: 'PIPELINE', label: 'В конвейере' },
  { value: 'DECIDED', label: 'У клиента' },
  { value: 'CLOSED', label: 'Закрытые' },
];
const RISKS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const DEFAULT_SORT = 'submittedAt:desc';
/** Норматив рассмотрения: дольше — подсвечиваем. */
const SLA_MS = 4 * 60 * 60 * 1000;

/** Фильтры живут в адресной строке — ссылкой на отфильтрованную очередь можно поделиться. */
function readFilters(params: URLSearchParams): BankQueueFilters {
  const status = (params.get('status') ?? 'ALL') as QueueStatusFilter;
  return {
    status: STATUS_FILTERS.some((f) => f.value === status) ? status : 'ALL',
    risk: (params.get('risk')?.split(',').filter((r): r is RiskLevel => RISKS.includes(r as RiskLevel)) ?? []),
    minAmount: Number(params.get('min')) || null,
    maxAmount: Number(params.get('max')) || null,
    q: params.get('q') ?? '',
    sort: params.get('sort') ?? DEFAULT_SORT,
  };
}

function toParams(f: BankQueueFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status !== 'ALL') p.set('status', f.status);
  if (f.risk.length) p.set('risk', f.risk.join(','));
  if (f.minAmount) p.set('min', String(f.minAmount));
  if (f.maxAmount) p.set('max', String(f.maxAmount));
  if (f.q) p.set('q', f.q);
  if (f.sort !== DEFAULT_SORT) p.set('sort', f.sort);
  return p;
}

export function BankQueuePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.q);
  const now = useNow(30_000);

  const queue = useRequest(`queue?${toParams(filters).toString()}`, (signal) =>
    bankApplicationApi.queue(filters, signal),
  );
  // Очередь живая: заявки доезжают из конвейера, клиенты отвечают на предложения
  useAutoReload(queue.reload, 5_000);

  function setFilters(patch: Partial<BankQueueFilters>) {
    setParams(toParams({ ...filters, ...patch }), { replace: true });
  }

  const [sortKey, sortDir] = filters.sort.split(':');
  const sort: TableSort = { key: sortKey, direction: sortDir === 'asc' ? 'asc' : 'desc' };

  const columns: TableColumn<BankQueueItem>[] = [
    {
      key: 'number',
      header: '№',
      width: 110,
      cell: (r) => <span className={styles.number}>{r.number}</span>,
    },
    {
      key: 'companyName',
      header: 'Заёмщик',
      sortable: true,
      cell: (r) => (
        <div className={styles.company}>
          <strong>{r.companyName}</strong>
          <span>
            {LEGAL_FORM_LABEL[r.legalForm]} · ИНН {r.inn}
          </span>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Продукт',
      cell: (r) => (
        <div className={styles.company}>
          <span>{PRODUCTS[r.product].title}</span>
          <span>{formatMonths(r.termMonths)}</span>
        </div>
      ),
    },
    { key: 'amount', header: 'Сумма', align: 'right', sortable: true, cell: (r) => <strong>{formatMoney(r.amount)}</strong> },
    {
      key: 'score',
      header: 'Риск',
      sortable: true,
      cell: (r) =>
        r.riskLevel ? (
          <span className={styles.risk}>
            <Badge tone={RISK_TONE[r.riskLevel]} size="s" dot>
              {RISK_LABEL[r.riskLevel]}
            </Badge>
            <span className={styles.score}>{r.score}</span>
          </span>
        ) : (
          <span className={styles.muted}>считается…</span>
        ),
    },
    {
      key: 'recommendation',
      header: 'Рекомендация',
      cell: (r) =>
        r.recommendation ? (
          <Badge tone={DECISION_TONE[r.recommendation]} size="s">
            {DECISION_RESULT_LABEL[r.recommendation]}
          </Badge>
        ) : (
          <span className={styles.muted}>—</span>
        ),
    },
    { key: 'status', header: 'Статус', cell: (r) => <StatusBadge status={r.status} audience="bank" size="s" /> },
    {
      key: 'submittedAt',
      header: 'Поступила',
      sortable: true,
      cell: (r) => {
        const waiting = now - new Date(r.submittedAt).getTime();
        const overdue = r.status === 'UNDER_REVIEW' && waiting > SLA_MS;
        return (
          <div className={styles.company}>
            <span>{formatRelative(r.submittedAt, now)}</span>
            {r.status === 'UNDER_REVIEW' && (
              <span className={cx(overdue && styles.overdue)}>в очереди {formatDuration(waiting)}</span>
            )}
          </div>
        );
      },
    },
  ];

  const counters = queue.data?.counters;
  const hasFilters = toParams({ ...filters, sort: DEFAULT_SORT }).toString() !== '';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Очередь заявок</h1>
          <p className={styles.subtitle}>
            {user?.fullName}, {user?.position?.toLowerCase()}
          </p>
        </div>
        <Button variant="secondary" size="s" leftIcon={<RefreshIcon size={16} />} onClick={queue.reload} loading={queue.refreshing}>
          Обновить
        </Button>
      </header>

      <section className={styles.counters} aria-label="Показатели очереди">
        <button type="button" className={styles.counter} onClick={() => setFilters({ status: 'ACTION' })}>
          <span>Ждут решения</span>
          <strong className={styles.accent}>{counters?.awaitingDecision ?? '—'}</strong>
        </button>
        <button type="button" className={styles.counter} onClick={() => setFilters({ status: 'PIPELINE' })}>
          <span>В конвейере сейчас</span>
          <strong>{counters?.inPipeline ?? '—'}</strong>
        </button>
        <div className={styles.counter}>
          <span>Решений сегодня</span>
          <strong>{counters?.decidedToday ?? '—'}</strong>
        </div>
        <div className={styles.counter}>
          <span>Ручные изменения рекомендаций</span>
          <strong>{counters ? `${Math.round(counters.overrideRate * 100)} %` : '—'}</strong>
        </div>
      </section>

      <Card padding="m" className={styles.filters}>
        <SegmentedControl
          size="s"
          fullWidth={false}
          options={STATUS_FILTERS}
          value={filters.status}
          onChange={(status) => setFilters({ status })}
        />
        <div className={styles.filterRow}>
          <form
            className={styles.search}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters({ q: search.trim() });
            }}
          >
            <Input
              size="s"
              aria-label="Поиск по названию, ИНН или номеру"
              placeholder="Компания, ИНН или № заявки"
              startAdornment={<SearchIcon size={16} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => search.trim() !== filters.q && setFilters({ q: search.trim() })}
            />
          </form>
          <div className={styles.amounts}>
            <MoneyInput
              size="s"
              aria-label="Сумма от"
              placeholder="Сумма от"
              value={filters.minAmount}
              onChange={(minAmount) => setFilters({ minAmount })}
            />
            <MoneyInput
              size="s"
              aria-label="Сумма до"
              placeholder="до"
              value={filters.maxAmount}
              onChange={(maxAmount) => setFilters({ maxAmount })}
            />
          </div>
          <div className={styles.riskChips} role="group" aria-label="Риск">
            {RISKS.map((r) => {
              const active = filters.risk.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  className={cx(styles.chip, active && styles.chipActive)}
                  onClick={() =>
                    setFilters({ risk: active ? filters.risk.filter((x) => x !== r) : [...filters.risk, r] })
                  }
                >
                  <span className={cx(styles.chipDot, styles[`dot_${r}`])} aria-hidden="true" />
                  {RISK_LABEL[r]} риск
                </button>
              );
            })}
          </div>
          {hasFilters && (
            <Button
              size="s"
              variant="ghost"
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      {queue.error !== undefined && !queue.data ? (
        <Alert tone="danger" title="Не удалось загрузить очередь" action={<Button size="s" variant="secondary" onClick={queue.reload}>Повторить</Button>}>
          {getErrorMessage(queue.error)}
        </Alert>
      ) : (
        <Table
          caption="Очередь кредитных заявок"
          columns={columns}
          rows={queue.data?.items ?? []}
          getRowKey={(r) => r.id}
          loading={queue.loading}
          sort={sort}
          onSortChange={(s) => setFilters({ sort: `${s.key}:${s.direction}` })}
          onRowClick={(r) => navigate(ROUTES.bank.application(r.id))}
          emptyState="Заявок с такими фильтрами нет"
        />
      )}
      {queue.data && <p className={styles.muted}>Показано: {queue.data.total}. Очередь обновляется автоматически.</p>}
    </div>
  );
}

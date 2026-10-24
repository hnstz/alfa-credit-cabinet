import type { ReactNode } from 'react';
import type { CheckLevel, Enrichment } from '@/entities/application';
import { cx } from '@/shared/lib/cx';
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, formatMonth, formatPercent } from '@/shared/lib/format';
import { BarChart } from '@/shared/ui';
import { AlertIcon, CheckCircleIcon } from '@/shared/ui/icons';
import styles from './EnrichmentReport.module.css';

const CHECK_LABEL: Record<CheckLevel, string> = { ok: 'Норма', warning: 'Внимание', critical: 'Стоп-фактор' };

function Source({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <section className={styles.source}>
      <header className={styles.sourceHead}>
        <h4 className={styles.sourceTitle}>{title}</h4>
        <span className={styles.sourceTag}>{source}</span>
      </header>
      <dl className={styles.kv}>{children}</dl>
    </section>
  );
}

function Row({ label, children, warn }: { label: string; children: ReactNode; warn?: boolean }) {
  return (
    <div className={cx(styles.row, warn && styles.rowWarn)}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Результаты обогащения: реестр, кредитная история, налоговая, обороты по счёту (все источники — моки). */
export function EnrichmentReport({ enrichment }: { enrichment: Enrichment }) {
  const { registry, creditBureau: bki, tax, turnover, checks } = enrichment;
  const gapSet = new Set(turnover.gapMonths);

  return (
    <div className={styles.report}>
      <ul className={styles.checks} aria-label="Автоматические проверки">
        {checks.map((c) => (
          <li key={c.text} className={cx(styles.check, styles[`check_${c.level}`])}>
            {c.level === 'ok' ? <CheckCircleIcon size={18} /> : <AlertIcon size={18} />}
            <span className={styles.srOnly}>{CHECK_LABEL[c.level]}: </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>

      <div className={styles.grid}>
        <Source title="Реестр" source={registry.source}>
          <Row label="Статус">{registry.status === 'ACTIVE' ? 'Действующая' : 'В процессе ликвидации'}</Row>
          <Row label="Регистрация">{formatDate(registry.registeredAt)}</Row>
          <Row label="Адрес" warn={registry.massAddress}>
            {registry.address}
            {registry.massAddress && <span className={styles.flag}> · массовый</span>}
          </Row>
          <Row label="Руководитель">{registry.director}</Row>
          {registry.founders.length > 0 && (
            <Row label="Учредители">
              {registry.founders.map((f) => `${f.name} (${f.share} %)`).join(', ')}
            </Row>
          )}
          <Row label="ОКВЭД">
            {registry.okved} · {registry.okvedName}
          </Row>
          <Row label="Изменений за год" warn={registry.changesLast12m >= 2}>
            {registry.changesLast12m}
          </Row>
        </Source>

        <Source title="Кредитная история" source={bki.source}>
          {bki.hasHistory ? (
            <>
              <Row label="Балл бюро">{bki.rating ?? '—'}</Row>
              <Row label="Активные кредиты">{bki.activeLoans}</Row>
              <Row label="Закрытые кредиты">{bki.closedLoans}</Row>
              <Row label="Общий долг">{formatMoney(bki.totalDebt)}</Row>
              <Row label="Платежи в месяц">{formatMoney(bki.monthlyPayments)}</Row>
              <Row label="Макс. просрочка" warn={bki.maxOverdueDays > 0}>
                {bki.maxOverdueDays > 0 ? `${bki.maxOverdueDays} дн. (${bki.overduesLast12m} за год)` : 'Нет'}
              </Row>
            </>
          ) : (
            <Row label="История" warn>
              Нет данных — заёмщик ранее не кредитовался
            </Row>
          )}
          <Row label="Запросы за 30 дней" warn={bki.requestsLast30d >= 4}>
            {bki.requestsLast30d}
          </Row>
        </Source>

        <Source title="Налоговая" source={tax.source}>
          <Row label="Задолженность" warn={tax.debt > 0}>
            {tax.debt > 0 ? formatMoney(tax.debt) : 'Нет'}
          </Row>
          <Row label="Блокировки счетов" warn={tax.blockedAccounts}>
            {tax.blockedAccounts ? 'Есть решение о приостановке' : 'Нет'}
          </Row>
          <Row label="Выручка по отчётности">{formatMoney(tax.reportedRevenue)} / год</Row>
          <Row label="Сотрудников (СЗВ)">{tax.employeesReported}</Row>
        </Source>
      </div>

      <section className={styles.turnover} aria-labelledby="turnover-title">
        <header className={styles.sourceHead}>
          <h4 id="turnover-title" className={styles.sourceTitle}>
            Обороты по счёту за 12 месяцев
          </h4>
          <span className={styles.sourceTag}>{turnover.source}</span>
        </header>
        <dl className={styles.turnoverStats}>
          <div>
            <dt>Средние поступления</dt>
            <dd>{formatMoney(turnover.avgInflow)} / мес.</dd>
          </div>
          <div>
            <dt>Динамика (3 мес. к 3 мес.)</dt>
            <dd>
              {turnover.trendPercent > 0 ? '+' : ''}
              {formatPercent(turnover.trendPercent)}
            </dd>
          </div>
          <div>
            <dt>Месяцев с кассовым разрывом</dt>
            <dd>{turnover.gapMonths.length}</dd>
          </div>
        </dl>
        <BarChart
          title="Поступления и списания по расчётному счёту"
          seriesLabel="Поступления"
          markerLabel="Списания"
          data={turnover.months.map((m) => ({
            key: m.month,
            label: formatMonth(m.month),
            value: m.inflow,
            marker: m.outflow,
          }))}
          formatValue={formatMoneyShort}
          height={140}
        />
        {gapSet.size > 0 && (
          <p className={styles.gapNote}>
            Списания выше поступлений: {turnover.months.filter((m) => gapSet.has(m.month)).map((m) => formatMonth(m.month)).join(', ')}
          </p>
        )}
      </section>

      <p className={styles.footnote}>Данные получены {formatDateTime(enrichment.fetchedAt)}. Все источники в демо — моки.</p>
    </div>
  );
}

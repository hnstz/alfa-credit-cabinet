import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ClientDecision, LoanTerms } from '@/entities/application';
import { ROUTES } from '@/shared/config/routes';
import { annuityPayment, overpayment } from '@/shared/lib/finance';
import { cx } from '@/shared/lib/cx';
import { formatDayMonth, formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { ButtonLink, Card } from '@/shared/ui';
import { ArrowDownIcon, ArrowUpIcon, CheckCircleIcon, GiftIcon, InfoIcon } from '@/shared/ui/icons';
import styles from './DecisionOutcome.module.css';

type Approved = Extract<ClientDecision, { kind: 'APPROVED' }>;
type Counter = Extract<ClientDecision, { kind: 'COUNTER_OFFER' }>;
type Rejected = Extract<ClientDecision, { kind: 'REJECTED' }>;

function Hero({ tone, icon, title, children }: { tone: 'success' | 'brand' | 'neutral'; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <header className={cx(styles.hero, styles[`hero_${tone}`])}>
      <span className={styles.heroIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h1 className={styles.heroTitle}>{title}</h1>
        <p className={styles.heroText}>{children}</p>
      </div>
    </header>
  );
}

function TermsGrid({ terms }: { terms: LoanTerms }) {
  return (
    <dl className={styles.terms}>
      <div className={styles.termMain}>
        <dt>Сумма</dt>
        <dd>{formatMoney(terms.amount)}</dd>
      </div>
      <div>
        <dt>Срок</dt>
        <dd>{formatMonths(terms.termMonths)}</dd>
      </div>
      <div>
        <dt>Ставка</dt>
        <dd>{formatPercent(terms.ratePercent)} годовых</dd>
      </div>
      <div>
        <dt>Платёж в месяц</dt>
        <dd>{formatMoney(terms.monthlyPayment)}</dd>
      </div>
      <div>
        <dt>Переплата за весь срок</dt>
        <dd>{formatMoney(overpayment(terms.amount, terms.ratePercent, terms.termMonths))}</dd>
      </div>
    </dl>
  );
}

const NEXT_STEPS = [
  'Нажмите «Оформить» — подготовим документы за несколько секунд',
  'Подпишите их онлайн кодом из SMS — ехать в офис не нужно',
  'Деньги придут на расчётный счёт в течение нескольких минут',
];

/* ---------- 1. Одобрение ---------- */

export function ApprovedOutcome({ decision, actions }: { decision: Approved; actions?: ReactNode }) {
  return (
    <div className={styles.stack}>
      <Hero tone="success" icon={<CheckCircleIcon size={28} />} title="Кредит одобрен">
        Банк готов выдать деньги на этих условиях. Предложение действует до {formatDayMonth(decision.validUntil)}.
      </Hero>
      <Card padding="l">
        <TermsGrid terms={decision.offer} />
        {actions && <div className={styles.actions}>{actions}</div>}
      </Card>
      <Card padding="l" variant="outlined">
        <h2 className={styles.sectionTitle}>Что дальше</h2>
        <ol className={styles.steps}>
          {NEXT_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

/* ---------- 2. Встречное предложение: «запрошено vs предложено» ---------- */

function Delta({ value, format, betterWhenLower }: { value: number; format: (v: number) => string; betterWhenLower: boolean }) {
  if (value === 0) return <span className={styles.same}>без изменений</span>;
  const better = betterWhenLower ? value < 0 : value > 0;
  return (
    <span className={cx(styles.delta, better ? styles.better : styles.worse)}>
      {value > 0 ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
      {value > 0 ? '+' : '−'}
      {format(Math.abs(value))}
    </span>
  );
}

export function CounterOfferOutcome({ decision, actions }: { decision: Counter; actions?: ReactNode }) {
  const { requested, offer } = decision;
  // Платёж, если бы выдали запрошенное по той же ставке — чтобы сравнение было честным
  const requestedPayment = annuityPayment(requested.amount, offer.ratePercent, requested.termMonths);

  const rows = [
    {
      label: 'Сумма',
      requested: formatMoney(requested.amount),
      offered: formatMoney(offer.amount),
      delta: <Delta value={offer.amount - requested.amount} format={formatMoney} betterWhenLower={false} />,
    },
    {
      label: 'Срок',
      requested: formatMonths(requested.termMonths),
      offered: formatMonths(offer.termMonths),
      delta: <Delta value={offer.termMonths - requested.termMonths} format={(v) => `${v} мес.`} betterWhenLower={false} />,
    },
    {
      label: 'Ставка',
      requested: '—',
      offered: `${formatPercent(offer.ratePercent)} годовых`,
      delta: null,
    },
    {
      label: 'Платёж в месяц',
      requested: `≈ ${formatMoney(requestedPayment)}*`,
      offered: formatMoney(offer.monthlyPayment),
      delta: <Delta value={offer.monthlyPayment - requestedPayment} format={formatMoney} betterWhenLower />,
    },
  ];

  return (
    <div className={styles.stack}>
      <Hero tone="brand" icon={<GiftIcon size={28} />} title="Можем выдать кредит на других условиях">
        {decision.explanation}
      </Hero>

      <Card padding="l">
        <table className={styles.compare}>
          <caption className={styles.srOnly}>Сравнение запрошенных и предложенных условий</caption>
          <thead>
            <tr>
              <th scope="col"><span className={styles.srOnly}>Параметр</span></th>
              <th scope="col">Вы запрашивали</th>
              <th scope="col" className={styles.offerCol}>Мы предлагаем</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td className={styles.requested}>{r.requested}</td>
                <td className={styles.offerCol}>
                  <strong>{r.offered}</strong>
                  {r.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.footnote}>
          * Если бы кредит выдали на запрошенных условиях по той же ставке. Предложение действует до{' '}
          {formatDayMonth(decision.validUntil)}.
        </p>
        {actions && <div className={styles.actions}>{actions}</div>}
      </Card>

      <p className={styles.muted}>
        Хотите другие условия? <Link to={ROUTES.client.newApplication}>Подайте новую заявку</Link> — анкета
        заполнится автоматически.
      </p>
    </div>
  );
}

/* ---------- 3. Отказ: деликатно, с причиной и советом ---------- */

export function RejectedOutcome({ decision, retryProduct }: { decision: Rejected; retryProduct?: string }) {
  const retryLink = decision.suggestedAmount
    ? `${ROUTES.client.newApplication}?${new URLSearchParams({
        amount: String(decision.suggestedAmount),
        ...(retryProduct ? { product: retryProduct } : {}),
      }).toString()}`
    : ROUTES.client.newApplication;

  return (
    <div className={styles.stack}>
      <Hero tone="neutral" icon={<InfoIcon size={28} />} title="Сейчас мы не можем выдать этот кредит">
        Мы внимательно изучили заявку. Это не окончательный ответ — ниже рассказали, почему так вышло и что поможет.
      </Hero>

      <div className={styles.twoCols}>
        <Card padding="l">
          <h2 className={styles.sectionTitle}>Почему так получилось</h2>
          <p className={styles.reasonTitle}>{decision.reason.title}</p>
          <p className={styles.muted}>{decision.reason.text}</p>
        </Card>
        <Card padding="l">
          <h2 className={styles.sectionTitle}>Что можно сделать</h2>
          <ol className={styles.steps}>
            {decision.advice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
        </Card>
      </div>

      <div className={styles.actionsRow}>
        <ButtonLink to={retryLink} size="l">
          {decision.suggestedAmount
            ? `Подать заявку на ${formatMoney(decision.suggestedAmount)}`
            : 'Подать новую заявку'}
        </ButtonLink>
        <ButtonLink to={ROUTES.client.home} size="l" variant="secondary">
          На главную
        </ButtonLink>
      </div>
    </div>
  );
}

import type { LoanTerms, SigningDocument } from '@/entities/application';
import { overpayment } from '@/shared/lib/finance';
import { formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { Alert } from '@/shared/ui';
import { buildSchedule } from '../lib/schedule';
import styles from './SigningFlow.module.css';

/** Содержимое документа в демо: ключевые условия вместо полного текста договора. */
export function DocumentPreview({ document, terms }: { document: SigningDocument; terms: LoanTerms }) {
  if (document.id === 'schedule') {
    const rows = buildSchedule(terms, 6);
    return (
      <div className={styles.preview}>
        <p className={styles.previewLead}>Первые 6 платежей из {terms.termMonths}. Полный график — в документе.</p>
        <table className={styles.schedule}>
          <thead>
            <tr>
              <th scope="col">№</th>
              <th scope="col">Платёж</th>
              <th scope="col">Проценты</th>
              <th scope="col">Основной долг</th>
              <th scope="col">Остаток</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{formatMoney(r.payment)}</td>
                <td>{formatMoney(r.interest)}</td>
                <td>{formatMoney(r.principal)}</td>
                <td>{formatMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.preview}>
      <dl className={styles.terms}>
        <div>
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
      <p className={styles.previewLead}>{document.description}.</p>
      <Alert tone="neutral">
        Это демо-версия: полный текст документа ({document.pages} стр.) появится после подключения системы
        электронного документооборота.
      </Alert>
    </div>
  );
}

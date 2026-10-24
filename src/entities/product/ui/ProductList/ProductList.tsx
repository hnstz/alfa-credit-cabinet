import { formatDayMonth, formatMoney, formatPercent } from '@/shared/lib/format';
import { BriefcaseIcon, FileIcon } from '@/shared/ui/icons';
import type { Product } from '../../model/types';
import styles from './ProductList.module.css';

/** Компактный список продуктов клиента: счета и кредиты. */
export function ProductList({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <p className={styles.empty}>Пока нет открытых продуктов.</p>;
  }

  return (
    <ul className={styles.list}>
      {products.map((p) => (
        <li key={p.id} className={styles.item}>
          <span className={styles.icon} aria-hidden="true">
            {p.kind === 'ACCOUNT' ? <BriefcaseIcon size={18} /> : <FileIcon size={18} />}
          </span>
          {p.kind === 'ACCOUNT' ? (
            <div className={styles.body}>
              <div className={styles.row}>
                <span className={styles.title}>{p.title}</span>
                <strong className={styles.amount}>{formatMoney(p.balance)}</strong>
              </div>
              <span className={styles.meta}>Счёт {p.maskedNumber}</span>
            </div>
          ) : (
            <div className={styles.body}>
              <div className={styles.row}>
                <span className={styles.title}>{p.title}</span>
                <strong className={styles.amount}>{formatMoney(p.debt)}</strong>
              </div>
              <span className={styles.meta}>
                Осталось выплатить · {formatPercent(p.ratePercent)} годовых
              </span>
              <div className={styles.progress} aria-hidden="true">
                <span style={{ width: `${Math.round((1 - p.debt / p.amount) * 100)}%` }} />
              </div>
              <span className={styles.meta}>
                Следующий платёж {formatDayMonth(p.nextPayment.date)} — {formatMoney(p.nextPayment.amount)}
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

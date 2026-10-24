import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from '../icons';
import { Skeleton } from '../Skeleton';
import styles from './Table.module.css';

export type SortDirection = 'asc' | 'desc';
export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Как отрисовать ячейку для строки. */
  cell: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  sortable?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  skeletonRows?: number;
  /** Что показать, если строк нет. */
  emptyState?: ReactNode;
  /** Управляемая сортировка: саму сортировку данных делает родитель/сервер. */
  sort?: TableSort | null;
  onSortChange?: (sort: TableSort) => void;
  /** Скрытая подпись таблицы для скринридеров. */
  caption?: string;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  loading = false,
  skeletonRows = 5,
  emptyState,
  sort,
  onSortChange,
  caption,
  className,
}: TableProps<T>) {
  function toggleSort(key: string) {
    if (!onSortChange) return;
    const direction: SortDirection =
      sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ key, direction });
  }

  function handleRowKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  }

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className={cx(styles.wrapper, className)}>
      <table className={styles.table} aria-busy={loading || undefined}>
        {caption && <caption className={styles.caption}>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const ariaSort = active
                ? sort.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : col.sortable
                  ? 'none'
                  : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={styles[`align_${col.align ?? 'left'}`]}
                  style={{ width: col.width }}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className={cx(styles.sortButton, active && styles.sortActive)}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.header}
                      {active ? (
                        sort.direction === 'asc' ? (
                          <ArrowUpIcon size={14} />
                        ) : (
                          <ArrowDownIcon size={14} />
                        )
                      ) : (
                        <ChevronsUpDownIcon size={14} />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`sk-${i}`}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <Skeleton variant="text" width="80%" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading &&
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className={cx(onRowClick && styles.clickable)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => handleRowKey(e, row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={styles[`align_${col.align ?? 'left'}`]}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>

      {isEmpty && <div className={styles.empty}>{emptyState ?? 'Нет данных'}</div>}
    </div>
  );
}

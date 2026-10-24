import type { ReactNode } from 'react';
import { formatDate, formatMoney, formatMonths } from '@/shared/lib/format';
import { Button } from '@/shared/ui';
import {
  COLLATERAL_LABEL,
  LEGAL_FORM_LABEL,
  MARITAL_LABEL,
  PRODUCTS,
  PURPOSE_LABEL,
  TAX_SYSTEM_LABEL,
} from '../../model/dictionaries';
import type { ApplicationForm } from '../../model/types';
import styles from './ApplicationFormView.module.css';

export type FormViewSection = 'loan' | 'company' | 'finance' | 'contacts';

export interface ApplicationFormViewProps {
  form: ApplicationForm;
  /** Кнопка «Изменить» у секции (в мастере — переход на нужный шаг). */
  onEdit?: (section: FormViewSection) => void;
  /** Двухколоночная раскладка секций (для широких экранов банка). */
  columns?: 1 | 2;
}

interface Row {
  label: string;
  value: ReactNode;
}

const dash = '—';
const money = (v: number | null) => (v === null ? dash : formatMoney(v));

function Section({
  title,
  rows,
  onEdit,
}: {
  title: string;
  rows: Row[];
  onEdit?: () => void;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h4 className={styles.title}>{title}</h4>
        {onEdit && (
          <Button size="s" variant="ghost" onClick={onEdit}>
            Изменить
          </Button>
        )}
      </header>
      <dl className={styles.list}>
        {rows.map((r) => (
          <div key={r.label} className={styles.row}>
            <dt>{r.label}</dt>
            <dd>{r.value || dash}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Анкета «как есть» — только чтение. Учитывает форму собственности. */
export function ApplicationFormView({ form, onEdit, columns = 1 }: ApplicationFormViewProps) {
  const { loan, company, finance, contacts } = form;
  const isOoo = company.legalForm === 'OOO';

  const loanRows: Row[] = [
    { label: 'Продукт', value: loan.product ? PRODUCTS[loan.product].title : dash },
    { label: 'Сумма', value: money(loan.amount) },
    { label: 'Срок', value: loan.termMonths ? formatMonths(loan.termMonths) : dash },
    { label: 'Цель', value: loan.purpose ? PURPOSE_LABEL[loan.purpose] : dash },
  ];
  if (loan.purposeComment) loanRows.push({ label: 'Подробнее о цели', value: loan.purposeComment });

  const companyRows: Row[] = [
    { label: 'Форма', value: LEGAL_FORM_LABEL[company.legalForm] },
    { label: 'Название', value: company.name },
    { label: 'ИНН', value: company.inn },
    { label: isOoo ? 'ОГРН' : 'ОГРНИП', value: company.ogrn },
    ...(isOoo ? [{ label: 'КПП', value: company.kpp }] : []),
    { label: 'ОКВЭД', value: company.okved },
    { label: 'Регион', value: company.region },
    { label: 'Дата регистрации', value: company.registeredAt ? formatDate(company.registeredAt) : dash },
    { label: 'Сотрудников', value: company.employees ?? dash },
    { label: 'Налоги', value: company.taxSystem ? TAX_SYSTEM_LABEL[company.taxSystem] : dash },
  ];
  if (isOoo) {
    companyRows.push(
      { label: 'Руководитель', value: company.directorName },
      {
        label: 'Учредители',
        value: company.founders.length ? (
          <ul className={styles.inlineList}>
            {company.founders.map((f) => (
              <li key={f.id}>
                {f.name || dash} — {f.share ?? dash} %
              </li>
            ))}
          </ul>
        ) : (
          dash
        ),
      },
    );
  } else {
    companyRows.push({
      label: 'Семейное положение',
      value: company.maritalStatus ? MARITAL_LABEL[company.maritalStatus] : dash,
    });
    if (company.maritalStatus === 'MARRIED') {
      companyRows.push(
        { label: 'Супруг(а)', value: company.spouseName },
        { label: 'Согласие супруга(и)', value: company.spouseConsent ? 'Есть' : 'Нет' },
      );
    }
  }

  const financeRows: Row[] = [
    { label: 'Выручка в месяц', value: money(finance.monthlyRevenue) },
    { label: 'Расходы в месяц', value: money(finance.monthlyExpenses) },
    {
      label: 'Другие кредиты',
      value: finance.hasOtherLoans ? `Да, ${money(finance.otherLoansPayment)} в месяц` : 'Нет',
    },
    {
      label: 'Залог',
      value:
        finance.collateral === 'NONE'
          ? COLLATERAL_LABEL.NONE
          : `${COLLATERAL_LABEL[finance.collateral]}, ${money(finance.collateralValue)}`,
    },
  ];

  const contactRows: Row[] = [
    { label: 'Контактное лицо', value: contacts.contactName },
    { label: 'Телефон', value: contacts.phone },
    { label: 'Email', value: contacts.email },
  ];

  return (
    <div className={columns === 2 ? styles.grid : styles.stack}>
      <Section title="Кредит" rows={loanRows} onEdit={onEdit && (() => onEdit('loan'))} />
      <Section title="Бизнес" rows={companyRows} onEdit={onEdit && (() => onEdit('company'))} />
      <Section title="Финансы" rows={financeRows} onEdit={onEdit && (() => onEdit('finance'))} />
      <Section title="Контакты" rows={contactRows} onEdit={onEdit && (() => onEdit('contacts'))} />
    </div>
  );
}

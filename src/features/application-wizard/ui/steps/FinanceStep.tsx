import { COLLATERAL_LABEL } from '@/entities/application';
import type { CollateralType } from '@/entities/application';
import { formatMoney } from '@/shared/lib/format';
import { Alert, MoneyInput, SegmentedControl, Select } from '@/shared/ui';
import { useWizard } from '../../model/useWizard';
import { FieldLabel } from '../parts/FieldLabel';
import styles from '../Wizard.module.css';

const COLLATERAL_OPTIONS = (Object.keys(COLLATERAL_LABEL) as CollateralType[]).map((value) => ({
  value,
  label: COLLATERAL_LABEL[value],
}));

/** Для этих видов залога нужна примерная стоимость. */
const VALUED_COLLATERAL: readonly CollateralType[] = ['REAL_ESTATE', 'VEHICLE', 'EQUIPMENT'];

export function FinanceStep() {
  const { form, errors, update, isPrefilled } = useWizard();
  const f = form.finance;
  const label = (text: string, path: string) => <FieldLabel text={text} prefilled={isPrefilled(path)} />;
  const free =
    f.monthlyRevenue !== null && f.monthlyExpenses !== null
      ? f.monthlyRevenue - f.monthlyExpenses - (f.hasOtherLoans ? (f.otherLoansPayment ?? 0) : 0)
      : null;

  return (
    <div className={styles.fields}>
      {isPrefilled('finance.monthlyRevenue') && (
        <Alert tone="info" title="Подставили цифры по вашему счёту">
          Выручка — средние поступления за последние полгода. Если реальная выручка другая — просто поправьте.
        </Alert>
      )}

      <div className={styles.grid2}>
        <MoneyInput
          label={label('Выручка в месяц', 'finance.monthlyRevenue')}
          value={f.monthlyRevenue}
          onChange={(monthlyRevenue) => update('finance', { monthlyRevenue })}
          error={errors['finance.monthlyRevenue']}
          hint="В среднем за последние месяцы"
          required
        />
        <MoneyInput
          label={label('Расходы в месяц', 'finance.monthlyExpenses')}
          value={f.monthlyExpenses}
          onChange={(monthlyExpenses) => update('finance', { monthlyExpenses })}
          error={errors['finance.monthlyExpenses']}
          hint="Аренда, зарплаты, закупки — без платежей по кредитам"
          required
        />
      </div>

      <SegmentedControl
        label={label('Есть другие кредиты или лизинг?', 'finance.hasOtherLoans')}
        options={[
          { value: 'no', label: 'Нет' },
          { value: 'yes', label: 'Да' },
        ]}
        value={f.hasOtherLoans ? 'yes' : 'no'}
        onChange={(v) => update('finance', { hasOtherLoans: v === 'yes' })}
      />
      {/* Динамическое поле: только если есть другие кредиты */}
      {f.hasOtherLoans && (
        <MoneyInput
          label={label('Сколько платите по ним в месяц', 'finance.otherLoansPayment')}
          value={f.otherLoansPayment}
          onChange={(otherLoansPayment) => update('finance', { otherLoansPayment })}
          error={errors['finance.otherLoansPayment']}
          hint={isPrefilled('finance.otherLoansPayment') ? 'По данным кредитной истории' : 'Сумма всех платежей'}
          required
        />
      )}

      <div className={styles.grid2}>
        <Select
          label="Залог или поручитель"
          options={COLLATERAL_OPTIONS}
          value={f.collateral}
          onChange={(e) => {
            const collateral = e.target.value as CollateralType;
            update('finance', {
              collateral,
              collateralValue: VALUED_COLLATERAL.includes(collateral) ? f.collateralValue : null,
            });
          }}
          hint="С залогом ставка обычно ниже"
        />
        {VALUED_COLLATERAL.includes(f.collateral) && (
          <MoneyInput
            label="Примерная стоимость залога"
            value={f.collateralValue}
            onChange={(collateralValue) => update('finance', { collateralValue })}
            error={errors['finance.collateralValue']}
            required
          />
        )}
      </div>

      {free !== null && (
        <div className={styles.freeCash} aria-live="polite">
          <span>Остаётся у бизнеса в месяц</span>
          <strong className={free < 0 ? styles.negative : undefined}>≈ {formatMoney(free)}</strong>
          <span className={styles.note}>
            {free > 0
              ? 'Из этих денег будет платиться кредит. Банк подберёт платёж, который не съест весь остаток.'
              : 'Расходы выше выручки — кредит может стать тяжёлой нагрузкой. Проверьте цифры.'}
          </span>
        </div>
      )}
    </div>
  );
}

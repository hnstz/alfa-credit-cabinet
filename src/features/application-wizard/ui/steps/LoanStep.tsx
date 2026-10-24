import { PRODUCT_CODES, PRODUCTS, PURPOSE_LABEL } from '@/entities/application';
import type { LoanPurpose, ProductCode } from '@/entities/application';
import { formatMoney } from '@/shared/lib/format';
import { MoneyInput, SegmentedControl, Select, Textarea } from '@/shared/ui';
import { useWizard } from '../../model/useWizard';
import { ChoiceCards } from '../parts/ChoiceCards';
import { FieldLabel } from '../parts/FieldLabel';
import styles from '../Wizard.module.css';

const PRODUCT_OPTIONS = PRODUCT_CODES.map((code) => ({
  value: code,
  title: PRODUCTS[code].title,
  description: PRODUCTS[code].description,
}));

const PURPOSE_OPTIONS = (Object.keys(PURPOSE_LABEL) as LoanPurpose[]).map((value) => ({
  value,
  label: PURPOSE_LABEL[value],
}));

/** Ближайший доступный срок у нового продукта — чтобы не сбрасывать выбор при смене вида кредита. */
function nearestTerm(terms: readonly number[], current: number | null): number | null {
  if (current === null) return null;
  return terms.reduce((best, t) => (Math.abs(t - current) < Math.abs(best - current) ? t : best), terms[0]);
}

export function LoanStep() {
  const { form, errors, update, isPrefilled } = useWizard();
  const loan = form.loan;
  const product = loan.product ? PRODUCTS[loan.product] : null;

  function selectProduct(code: ProductCode) {
    update('loan', { product: code, termMonths: nearestTerm(PRODUCTS[code].terms, loan.termMonths) });
  }

  return (
    <div className={styles.fields}>
      <ChoiceCards
        label="На что нужен кредит"
        options={PRODUCT_OPTIONS}
        value={loan.product}
        onChange={selectProduct}
        error={errors['loan.product']}
      />

      <div className={styles.grid2}>
        <MoneyInput
          label={<FieldLabel text="Сумма" prefilled={isPrefilled('loan.amount')} />}
          value={loan.amount}
          onChange={(amount) => update('loan', { amount })}
          error={errors['loan.amount']}
          hint={
            product
              ? `От ${formatMoney(product.minAmount)} до ${formatMoney(product.maxAmount)}`
              : 'Можно примерно — точную сумму предложит банк'
          }
          required
        />
        <SegmentedControl
          label="Срок, месяцев"
          options={(product?.terms ?? [6, 12, 24, 36, 60]).map((t) => ({ value: String(t), label: String(t) }))}
          value={loan.termMonths === null ? '' : String(loan.termMonths)}
          onChange={(v) => update('loan', { termMonths: Number(v) })}
          error={errors['loan.termMonths']}
          hint={!product ? 'Сначала выберите вид кредита' : undefined}
          disabled={!product}
        />
      </div>

      <Select
        label="Цель кредита"
        placeholder="Выберите цель"
        options={PURPOSE_OPTIONS}
        value={loan.purpose}
        onChange={(e) => update('loan', { purpose: e.target.value as LoanPurpose })}
        error={errors['loan.purpose']}
        required
      />

      {/* Динамическое поле: появляется только для цели «Другое» */}
      {loan.purpose === 'OTHER' && (
        <Textarea
          label="Расскажите подробнее"
          placeholder="Например: аванс поставщику за новую партию"
          value={loan.purposeComment}
          onChange={(e) => update('loan', { purposeComment: e.target.value })}
          error={errors['loan.purposeComment']}
          maxLength={300}
          showCounter
          rows={3}
          required
        />
      )}
    </div>
  );
}

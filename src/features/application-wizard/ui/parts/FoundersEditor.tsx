import type { Founder } from '@/entities/application';
import { parseDigits } from '@/shared/lib/format';
import { Button, Input } from '@/shared/ui';
import { PlusIcon, TrashIcon } from '@/shared/ui/icons';
import type { FieldErrors } from '../../model/validation';
import styles from '../Wizard.module.css';

interface FoundersEditorProps {
  founders: Founder[];
  onChange: (founders: Founder[]) => void;
  errors: FieldErrors;
}

/** Список учредителей ООО с долями. Сумма долей подсвечивается, пока не равна 100 %. */
export function FoundersEditor({ founders, onChange, errors }: FoundersEditorProps) {
  const total = founders.reduce((s, f) => s + (f.share ?? 0), 0);

  function patch(index: number, change: Partial<Founder>) {
    onChange(founders.map((f, i) => (i === index ? { ...f, ...change } : f)));
  }

  function add() {
    const id = `f${Date.now().toString(36)}`;
    onChange([...founders, { id, name: '', share: founders.length === 0 ? 100 : null }]);
  }

  return (
    <div className={styles.founders}>
      <div className={styles.foundersHead}>
        <span className={styles.legend}>Учредители и доли</span>
        <span className={total === 100 ? styles.totalOk : styles.totalBad}>Всего: {total} %</span>
      </div>

      {founders.map((f, i) => (
        <div key={f.id} className={styles.founderRow}>
          <Input
            label={i === 0 ? 'ФИО или название' : undefined}
            aria-label={`Учредитель ${i + 1}`}
            value={f.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            error={errors[`company.founders.${i}.name`]}
          />
          <Input
            label={i === 0 ? 'Доля' : undefined}
            aria-label={`Доля учредителя ${i + 1}, %`}
            inputMode="numeric"
            value={f.share === null ? '' : String(f.share)}
            onChange={(e) => patch(i, { share: parseDigits(e.target.value.slice(0, 3)) })}
            endAdornment="%"
            error={errors[`company.founders.${i}.share`]}
          />
          <Button
            variant="ghost"
            size="m"
            className={i === 0 ? styles.founderRemoveFirst : undefined}
            aria-label={`Удалить учредителя ${i + 1}`}
            onClick={() => onChange(founders.filter((_, idx) => idx !== i))}
          >
            <TrashIcon size={18} />
          </Button>
        </div>
      ))}

      {errors['company.founders'] && (
        <p className={styles.error} aria-live="polite">
          {errors['company.founders']}
        </p>
      )}

      <div>
        <Button variant="outline" size="s" leftIcon={<PlusIcon size={16} />} onClick={add}>
          Добавить учредителя
        </Button>
      </div>
    </div>
  );
}

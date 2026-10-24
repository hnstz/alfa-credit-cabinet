import { MARITAL_LABEL, TAX_SYSTEM_LABEL, TAX_SYSTEMS_BY_FORM } from '@/entities/application';
import type { MaritalStatus, TaxSystem } from '@/entities/application';
import type { LegalForm } from '@/entities/user';
import { parseDigits } from '@/shared/lib/format';
import { formatPhone } from '@/shared/lib/requisites';
import { Checkbox, Input, SegmentedControl, Select } from '@/shared/ui';
import { useWizard } from '../../model/useWizard';
import { FieldLabel } from '../parts/FieldLabel';
import { FoundersEditor } from '../parts/FoundersEditor';
import styles from '../Wizard.module.css';

const LEGAL_FORM_OPTIONS = [
  { value: 'OOO', label: 'Компания (ООО)' },
  { value: 'IP', label: 'Предприниматель (ИП)' },
] as const;

const MARITAL_OPTIONS = (Object.keys(MARITAL_LABEL) as MaritalStatus[]).map((value) => ({
  value,
  label: MARITAL_LABEL[value],
}));

const onlyDigits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

export function CompanyStep() {
  const { form, errors, update, isPrefilled } = useWizard();
  const c = form.company;
  const contacts = form.contacts;
  const isOoo = c.legalForm === 'OOO';
  const label = (text: string, path: string) => <FieldLabel text={text} prefilled={isPrefilled(path)} />;

  const taxOptions = TAX_SYSTEMS_BY_FORM[c.legalForm].map((value) => ({
    value,
    label: TAX_SYSTEM_LABEL[value],
  }));

  function changeLegalForm(legalForm: LegalForm) {
    // Патент есть только у ИП — при переключении на ООО сбрасываем
    const taxSystem = legalForm === 'OOO' && c.taxSystem === 'PSN' ? '' : c.taxSystem;
    update('company', { legalForm, taxSystem });
  }

  return (
    <div className={styles.fields}>
      <SegmentedControl
        label="Форма бизнеса"
        options={LEGAL_FORM_OPTIONS}
        value={c.legalForm}
        onChange={changeLegalForm}
        hint={isPrefilled('company.legalForm') ? 'Определили по профилю вашей компании' : undefined}
      />

      <Input
        label={label(isOoo ? 'Название компании' : 'ФИО предпринимателя', 'company.name')}
        value={c.name}
        onChange={(e) => update('company', { name: e.target.value })}
        error={errors['company.name']}
        required
      />

      <div className={styles.grid3}>
        <Input
          label={label('ИНН', 'company.inn')}
          inputMode="numeric"
          value={c.inn}
          onChange={(e) => update('company', { inn: onlyDigits(e.target.value, 12) })}
          error={errors['company.inn']}
          hint={isOoo ? '10 цифр' : '12 цифр'}
          required
        />
        <Input
          label={label(isOoo ? 'ОГРН' : 'ОГРНИП', 'company.ogrn')}
          inputMode="numeric"
          value={c.ogrn}
          onChange={(e) => update('company', { ogrn: onlyDigits(e.target.value, 15) })}
          error={errors['company.ogrn']}
          required
        />
        {isOoo && (
          <Input
            label={label('КПП', 'company.kpp')}
            value={c.kpp}
            onChange={(e) => update('company', { kpp: e.target.value.toUpperCase().slice(0, 9) })}
            error={errors['company.kpp']}
            required
          />
        )}
      </div>

      <div className={styles.grid2}>
        <Input
          label={label('Основной ОКВЭД', 'company.okved')}
          placeholder="47.71"
          value={c.okved}
          onChange={(e) => update('company', { okved: e.target.value.replace(/[^\d.]/g, '').slice(0, 8) })}
          error={errors['company.okved']}
          required
        />
        <Input
          label={label('Регион', 'company.region')}
          value={c.region}
          onChange={(e) => update('company', { region: e.target.value })}
          error={errors['company.region']}
          required
        />
        <Input
          label={label('Дата регистрации', 'company.registeredAt')}
          type="date"
          value={c.registeredAt}
          onChange={(e) => update('company', { registeredAt: e.target.value })}
          error={errors['company.registeredAt']}
          required
        />
        <Input
          label={label('Сотрудников', 'company.employees')}
          inputMode="numeric"
          value={c.employees === null ? '' : String(c.employees)}
          onChange={(e) => update('company', { employees: parseDigits(e.target.value.slice(0, 6)) })}
          error={errors['company.employees']}
          required
        />
      </div>

      <Select
        label={label('Система налогообложения', 'company.taxSystem')}
        placeholder="Выберите систему"
        options={taxOptions}
        value={c.taxSystem}
        onChange={(e) => update('company', { taxSystem: e.target.value as TaxSystem })}
        error={errors['company.taxSystem']}
        required
      />

      {/* Динамический блок: для ООО — руководитель и учредители, для ИП — семейное положение */}
      {isOoo ? (
        <fieldset className={styles.group}>
          <legend className={styles.groupTitle}>Руководство и владельцы</legend>
          <Input
            label={label('ФИО руководителя', 'company.directorName')}
            value={c.directorName}
            onChange={(e) => update('company', { directorName: e.target.value })}
            error={errors['company.directorName']}
            required
          />
          <FoundersEditor
            founders={c.founders}
            onChange={(founders) => update('company', { founders })}
            errors={errors}
          />
        </fieldset>
      ) : (
        <fieldset className={styles.group}>
          <legend className={styles.groupTitle}>Семья</legend>
          <p className={styles.note}>
            Для предпринимателей банк учитывает семейное положение: супруг(а) может выступить поручителем.
          </p>
          <SegmentedControl
            label={label('Семейное положение', 'company.maritalStatus')}
            options={MARITAL_OPTIONS}
            value={c.maritalStatus}
            onChange={(maritalStatus) => update('company', { maritalStatus })}
            error={errors['company.maritalStatus']}
          />
          {c.maritalStatus === 'MARRIED' && (
            <>
              <Input
                label="ФИО супруга(и)"
                value={c.spouseName}
                onChange={(e) => update('company', { spouseName: e.target.value })}
                error={errors['company.spouseName']}
                required
              />
              <Checkbox
                label="Супруг(а) готов(а) стать поручителем"
                description="Необязательно, но с поручителем банк может предложить сумму больше или ставку ниже"
                checked={c.spouseConsent}
                onChange={(e) => update('company', { spouseConsent: e.target.checked })}
              />
            </>
          )}
        </fieldset>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.groupTitle}>Как с вами связаться</legend>
        <div className={styles.grid3}>
          <Input
            label={label('Контактное лицо', 'contacts.contactName')}
            autoComplete="name"
            value={contacts.contactName}
            onChange={(e) => update('contacts', { contactName: e.target.value })}
            error={errors['contacts.contactName']}
            required
          />
          <Input
            label={label('Телефон', 'contacts.phone')}
            type="tel"
            autoComplete="tel"
            placeholder="+7 (999) 123-45-67"
            value={contacts.phone}
            onChange={(e) => update('contacts', { phone: formatPhone(e.target.value) })}
            error={errors['contacts.phone']}
            required
          />
          <Input
            label={label('Email', 'contacts.email')}
            type="email"
            autoComplete="email"
            value={contacts.email}
            onChange={(e) => update('contacts', { email: e.target.value.trim() })}
            error={errors['contacts.email']}
            required
          />
        </div>
      </fieldset>
    </div>
  );
}

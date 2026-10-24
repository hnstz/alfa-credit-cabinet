import { ApplicationFormView } from '@/entities/application';
import { Alert, Checkbox } from '@/shared/ui';
import { SECTION_STEP } from '../../model/steps';
import { useWizard } from '../../model/useWizard';
import styles from '../Wizard.module.css';

export function ReviewStep() {
  const { form, errors, update, goTo, state } = useWizard();

  return (
    <div className={styles.fields}>
      <ApplicationFormView form={form} onEdit={(section) => goTo(SECTION_STEP[section])} />

      <fieldset className={styles.group}>
        <legend className={styles.groupTitle}>Согласия</legend>
        <Checkbox
          label="Разрешаю банку посмотреть мою кредитную историю"
          description="Так мы узнаем о других кредитах и сможем предложить посильный платёж"
          checked={form.consents.creditHistory}
          onChange={(e) => update('consents', { creditHistory: e.target.checked })}
          error={errors['consents.creditHistory']}
        />
        <Checkbox
          label="Согласен(на) на обработку данных из анкеты"
          description="Данные нужны только для рассмотрения заявки"
          checked={form.consents.dataProcessing}
          onChange={(e) => update('consents', { dataProcessing: e.target.checked })}
          error={errors['consents.dataProcessing']}
        />
      </fieldset>

      {state.submitError && (
        <Alert tone="danger" title="Заявка не отправилась" role="alert">
          {state.submitError}
        </Alert>
      )}
    </div>
  );
}

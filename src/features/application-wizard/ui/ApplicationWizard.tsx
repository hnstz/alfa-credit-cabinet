import type { FormEvent } from 'react';
import type { ClientApplication } from '@/entities/application';
import { Button, Card, Stepper } from '@/shared/ui';
import { ArrowLeftIcon, ArrowRightIcon } from '@/shared/ui/icons';
import { LAST_STEP, WIZARD_STEPS } from '../model/steps';
import type { WizardStepId } from '../model/steps';
import { useWizard } from '../model/useWizard';
import { WizardAside } from './parts/WizardAside';
import { CompanyStep } from './steps/CompanyStep';
import { FinanceStep } from './steps/FinanceStep';
import { LoanStep } from './steps/LoanStep';
import { ReviewStep } from './steps/ReviewStep';
import styles from './Wizard.module.css';

function StepContent({ id }: { id: WizardStepId }) {
  switch (id) {
    case 'loan':
      return <LoanStep />;
    case 'company':
      return <CompanyStep />;
    case 'finance':
      return <FinanceStep />;
    case 'review':
      return <ReviewStep />;
  }
}

interface ApplicationWizardProps {
  onSubmitted: (application: ClientApplication) => void;
}

/** Мастер подачи заявки. Используется внутри <WizardProvider>. */
export function ApplicationWizard({ onSubmitted }: ApplicationWizardProps) {
  const { state, next, back, goTo, submit } = useWizard();
  const step = WIZARD_STEPS[state.step];
  const isLast = state.step === LAST_STEP;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLast) {
      next();
      return;
    }
    const application = await submit();
    if (application) onSubmitted(application);
  }

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <Stepper
          steps={WIZARD_STEPS.map((s) => ({ id: s.id, title: s.title, description: s.description }))}
          currentIndex={state.step}
          onStepClick={goTo}
        />

        <Card padding="l" as="section" aria-labelledby="wizard-step-title">
          <form onSubmit={handleSubmit} noValidate data-wizard>
            <header className={styles.stepHeader}>
              <p className={styles.stepCounter}>
                Шаг {state.step + 1} из {WIZARD_STEPS.length}
              </p>
              <h2 id="wizard-step-title" className={styles.stepTitle}>
                {step.heading}
              </h2>
              <p className={styles.stepLead}>{step.lead}</p>
            </header>

            <StepContent id={step.id} />

            <footer className={styles.nav}>
              {state.step > 0 ? (
                <Button variant="secondary" leftIcon={<ArrowLeftIcon size={18} />} onClick={back}>
                  Назад
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                size="l"
                loading={state.status === 'submitting'}
                rightIcon={isLast ? undefined : <ArrowRightIcon size={18} />}
              >
                {isLast ? 'Отправить заявку' : 'Далее'}
              </Button>
            </footer>
          </form>
        </Card>
      </div>

      <WizardAside />
    </div>
  );
}

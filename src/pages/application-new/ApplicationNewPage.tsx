import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PRODUCT_CODES } from '@/entities/application';
import type { DraftPreset, ProductCode } from '@/entities/application';
import { ApplicationWizard, WizardProvider } from '@/features/application-wizard';
import { ROUTES } from '@/shared/config/routes';
import { ArrowLeftIcon } from '@/shared/ui/icons';
import styles from './ApplicationNewPage.module.css';

/** Параметры персонального предложения из ссылки: ?product=CREDIT_LINE&amount=15000000&term=24 */
function readPreset(params: URLSearchParams): DraftPreset | undefined {
  const product = params.get('product');
  const amount = Number(params.get('amount'));
  const term = Number(params.get('term'));
  const preset: DraftPreset = {};
  if (product && (PRODUCT_CODES as string[]).includes(product)) preset.product = product as ProductCode;
  if (amount > 0) preset.amount = amount;
  if (term > 0) preset.termMonths = term;
  return Object.keys(preset).length ? preset : undefined;
}

export function ApplicationNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Читаем один раз: если пользователь обновит страницу, параметры не применятся повторно
  const [preset] = useState(() => readPreset(params));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to={ROUTES.client.home} className={styles.back}>
          <ArrowLeftIcon size={16} /> На главную
        </Link>
        <h1 className={styles.title}>Заявка на кредит</h1>
        {preset && <p className={styles.subtitle}>Подставили условия из вашего персонального предложения.</p>}
      </header>

      <WizardProvider preset={preset}>
        <ApplicationWizard
          onSubmitted={(application) => navigate(ROUTES.client.application(application.id), { replace: true })}
        />
      </WizardProvider>
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/shared/api';
import { config } from '@/shared/config';
import { DEMO_ACCOUNTS } from '@/shared/config/demoAccounts';
import { Badge, Button, Input } from '@/shared/ui';
import type { LoginRequest } from '../../api/types';
import { useAuth } from '../../model/useAuth';
import styles from './LoginForm.module.css';

interface FieldErrors {
  login?: string;
  password?: string;
}

/**
 * Форма входа. После успешного входа навигацию делает GuestOnly-guard:
 * он видит пользователя и перенаправляет на нужную страницу.
 */
export function LoginForm() {
  const { login } = useAuth();
  const [values, setValues] = useState<LoginRequest>({ login: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(credentials: LoginRequest) {
    setSubmitting(true);
    setFormError(null);
    try {
      await login(credentials);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Не удалось войти. Попробуйте ещё раз.');
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!values.login.trim()) errors.login = 'Введите логин';
    if (!values.password) errors.password = 'Введите пароль';
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) void submit(values);
  }

  function loginAs(account: { login: string; password: string }) {
    setValues({ login: account.login, password: account.password });
    setFieldErrors({});
    void submit({ login: account.login, password: account.password });
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Input
          label="Логин"
          autoComplete="username"
          value={values.login}
          error={fieldErrors.login}
          onChange={(e) => setValues((v) => ({ ...v, login: e.target.value }))}
        />
        <Input
          label="Пароль"
          type="password"
          autoComplete="current-password"
          value={values.password}
          error={fieldErrors.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        />
        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" size="l" fullWidth loading={submitting}>
          Войти
        </Button>
      </form>

      {config.showDemoAccounts && (
        <section className={styles.demo} aria-label="Тестовые аккаунты">
          <h2 className={styles.demoTitle}>Тестовые аккаунты</h2>
          <ul className={styles.demoList}>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.login}>
                <button
                  type="button"
                  className={styles.demoItem}
                  disabled={submitting}
                  onClick={() => loginAs(a)}
                >
                  <span className={styles.demoHead}>
                    <strong>{a.title}</strong>
                    <Badge size="s" tone={a.role === 'officer' ? 'info' : 'brand'}>
                      {a.role === 'officer' ? 'Банк' : 'Клиент'}
                    </Badge>
                  </span>
                  <span className={styles.demoDesc}>{a.description}</span>
                  <code className={styles.demoCreds}>
                    {a.login} / {a.password}
                  </code>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

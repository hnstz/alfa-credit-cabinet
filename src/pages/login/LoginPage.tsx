import { useState } from 'react';
import { clearBannerShows } from '@/entities/banner';
import { LoginForm } from '@/features/auth';
import { api } from '@/shared/api';
import { config } from '@/shared/config';
import { Button } from '@/shared/ui';
import styles from './LoginPage.module.css';

/** Сброс мок-«бэкенда» к исходным сценариям (только в режиме моков). */
function DemoReset() {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');

  async function reset() {
    setState('pending');
    try {
      await api.post<void>('/demo/reset', undefined, { skipAuth: true });
      clearBannerShows(); // счётчики показов витрины живут в браузере — сбрасываем вместе с данными
      setState('done');
    } catch {
      setState('idle');
    }
  }

  return (
    <div className={styles.demo}>
      <p>
        Демо-данные хранятся в этом браузере и общие для всех вкладок: можно открыть клиента и сотрудника банка
        рядом.
      </p>
      <Button size="s" variant="ghost" onClick={reset} loading={state === 'pending'}>
        {state === 'done' ? 'Данные сброшены' : 'Сбросить демо-данные'}
      </Button>
    </div>
  );
}

export function LoginPage() {
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Вход в кабинет</h1>
        <p className={styles.subtitle}>Для действующих клиентов банка и сотрудников банка</p>
      </header>
      <LoginForm />
      {config.useMocks && <DemoReset />}
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <h1 className={styles.code}>404</h1>
      <p>Такой страницы нет. Возможно, она переехала.</p>
      <Button onClick={() => navigate('/', { replace: true })}>На главную</Button>
    </div>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter'; // шрифт, включая кириллицу
import './app/styles/index.css';
import App from './app/App';
import { config } from '@/shared/config';

async function bootstrap() {
  // Моки включаются флагом USE_MOCKS (public/config.js или .env).
  // Динамический импорт: код MSW не попадает в загрузку, если моки выключены.
  if (config.useMocks) {
    const { worker } = await import('@/shared/mocks/browser');
    // MSW 3: опция называется onUnhandledFrame (в v2 была onUnhandledRequest)
    await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();

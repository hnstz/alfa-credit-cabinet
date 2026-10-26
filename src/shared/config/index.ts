export interface RuntimeConfig {
  API_URL: string;
  USE_MOCKS: boolean;
  SHOW_DEMO_ACCOUNTS: boolean;
  /**
   * Адрес ML-сервиса (каталог ml/): '/ml' (прокси Vite/nginx) или 'http://localhost:8000'.
   * Через него идут персональный баннер (POST /predict) и скоринг заявок (POST /score, /decision).
   * Пусто — ML не используется, работают встроенные заглушки.
   */
  ML_API_URL: string;
  /** Отдельный адрес модели баннера. Пусто — берётся ML_API_URL + '/predict'. */
  BANNER_MODEL_URL: string;
}

declare global {
  interface Window {
    __CONFIG__?: Partial<RuntimeConfig>;
  }
}

const runtime: Partial<RuntimeConfig> = window.__CONFIG__ ?? {};
const env = import.meta.env;

const apiUrl: string = runtime.API_URL ?? env.VITE_API_URL ?? '/api';

const mlApiUrl = (runtime.ML_API_URL ?? env.VITE_ML_API_URL ?? '').trim().replace(/\/$/, '');
const bannerModelUrl = (runtime.BANNER_MODEL_URL ?? env.VITE_BANNER_MODEL_URL ?? '').trim() || (mlApiUrl ? `${mlApiUrl}/predict` : '');

/** Единая точка чтения настроек. Приоритет: public/config.js → .env → значение по умолчанию. */
export const config = {
  apiUrl: apiUrl.replace(/\/$/, ''),
  useMocks: runtime.USE_MOCKS ?? env.VITE_USE_MOCKS === 'true',
  showDemoAccounts: runtime.SHOW_DEMO_ACCOUNTS ?? true,
  mlApiUrl,
  bannerModelUrl,
} as const;

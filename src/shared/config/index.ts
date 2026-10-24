export interface RuntimeConfig {
  API_URL: string;
  USE_MOCKS: boolean;
  SHOW_DEMO_ACCOUNTS: boolean;
  /** Адрес ML-модели персонального баннера. Пусто — работает встроенная заглушка. */
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

/** Единая точка чтения настроек. Приоритет: public/config.js → .env → значение по умолчанию. */
export const config = {
  apiUrl: apiUrl.replace(/\/$/, ''),
  useMocks: runtime.USE_MOCKS ?? env.VITE_USE_MOCKS === 'true',
  showDemoAccounts: runtime.SHOW_DEMO_ACCOUNTS ?? true,
  bannerModelUrl: (runtime.BANNER_MODEL_URL ?? env.VITE_BANNER_MODEL_URL ?? '').trim(),
} as const;

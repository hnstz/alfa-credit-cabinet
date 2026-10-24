/*
 * Рантайм-конфиг. Подключается в index.html ДО основного скрипта.
 * Меняется БЕЗ пересборки (в Docker можно подменить файл через volume).
 */
window.__CONFIG__ = {
  API_URL: '/api',          // адрес бэкенда (или '/api' + proxy в nginx)
  USE_MOCKS: true,          // true — запросы перехватывает MSW (бэкенд не нужен)
  SHOW_DEMO_ACCOUNTS: true, // показывать на странице входа тестовые аккаунты
  BANNER_MODEL_URL: '',     // адрес ML-модели баннера, напр. 'http://localhost:8000/predict' ('' — встроенная заглушка)
};

export type DemoRole = 'client' | 'officer';

export interface DemoAccount {
  login: string;
  password: string;
  role: DemoRole;
  title: string;
  description: string;
}

/**
 * Тестовые учётные записи (синтетические данные).
 * Источник правды и для MSW-моков, и для подсказки на странице входа.
 * У каждого клиента свой сценарий — от него зависят лента, заявки и решение скоринга.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    login: 'romashka',
    password: 'demo1234',
    role: 'client',
    title: 'ООО «Ромашка»',
    description: 'Идеальный заёмщик: обороты растут, кредиты платит вовремя. Есть одобренная заявка',
  },
  {
    login: 'petrova',
    password: 'demo1234',
    role: 'client',
    title: 'ИП Петрова А. С.',
    description: 'Кассовые разрывы: сезонная выручка. Ждёт ответа на встречное предложение',
  },
  {
    login: 'novikov',
    password: 'demo1234',
    role: 'client',
    title: 'ИП Новиков Д. А.',
    description: 'ИП без кредитной истории, бизнесу 8 месяцев. Был отказ, есть незаконченная анкета',
  },
  {
    login: 'ivanova',
    password: 'demo1234',
    role: 'officer',
    title: 'Мария Иванова',
    description: 'Кредитный специалист банка — очередь заявок и решения',
  },
];

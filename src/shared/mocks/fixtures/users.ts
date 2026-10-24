import type { User } from '@/entities/user';
import { DEMO_ACCOUNTS } from '@/shared/config/demoAccounts';
import { BORROWERS } from './borrowers';

/** Все данные синтетические: ИНН/ОГРН выдуманы (но проходят контрольные суммы). */
const USERS: User[] = [
  {
    id: 'u-romashka',
    role: 'client',
    login: 'romashka',
    fullName: 'Сергей Волков',
    position: 'Генеральный директор',
    company: BORROWERS['c-romashka'].company,
  },
  {
    id: 'u-petrova',
    role: 'client',
    login: 'petrova',
    fullName: 'Анна Петрова',
    position: 'Индивидуальный предприниматель',
    company: BORROWERS['c-petrova'].company,
  },
  {
    id: 'u-novikov',
    role: 'client',
    login: 'novikov',
    fullName: 'Дмитрий Новиков',
    position: 'Индивидуальный предприниматель',
    company: BORROWERS['c-novikov'].company,
  },
  {
    id: 'u-ivanova',
    role: 'officer',
    login: 'ivanova',
    fullName: 'Мария Иванова',
    position: 'Кредитный специалист',
  },
];

export function findUserById(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

/** Проверка логина/пароля по списку демо-аккаунтов. */
export function authenticate(login: string, password: string): User | undefined {
  const account = DEMO_ACCOUNTS.find((a) => a.login === login && a.password === password);
  return account ? USERS.find((u) => u.login === account.login) : undefined;
}

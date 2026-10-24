export type UserRole = 'client' | 'officer';

export type LegalForm = 'OOO' | 'IP';

/** Профиль компании клиента (синтетические данные). */
export interface CompanyProfile {
  id: string;
  legalForm: LegalForm;
  name: string;
  inn: string;
  /** ОГРН для юрлица, ОГРНИП для ИП */
  ogrn: string;
  okved: string;
  okvedName: string;
  /** ISO-дата регистрации */
  registeredAt: string;
  employees: number;
  /** Годовая выручка, ₽ */
  annualRevenue: number;
  region: string;
}

export interface User {
  id: string;
  role: UserRole;
  login: string;
  fullName: string;
  /** Должность: у клиента — в компании, у сотрудника — в банке */
  position: string;
  /** Только для role === 'client' */
  company?: CompanyProfile;
}

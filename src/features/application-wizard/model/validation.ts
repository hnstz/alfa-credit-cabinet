import { PRODUCTS, TAX_SYSTEMS_BY_FORM } from '@/entities/application';
import type {
  ApplicationForm,
  CompanySection,
  ConsentsSection,
  ContactsSection,
  FieldPath,
  FinanceSection,
  LoanSection,
} from '@/entities/application';
import { formatMoney } from '@/shared/lib/format';
import { isValidEmail, isValidInn, isValidKpp, isValidOgrn, isValidPhone } from '@/shared/lib/requisites';
import { WIZARD_STEPS } from './steps';
import type { WizardStepId } from './steps';

export type FieldErrors = Partial<Record<FieldPath, string>>;

const REQUIRED = 'Заполните поле';
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function validateLoan(loan: LoanSection): FieldErrors {
  const e: FieldErrors = {};
  const product = loan.product ? PRODUCTS[loan.product] : null;

  if (!product) e['loan.product'] = 'Выберите, на что нужен кредит';
  if (loan.amount === null) e['loan.amount'] = 'Укажите сумму';
  else if (product && (loan.amount < product.minAmount || loan.amount > product.maxAmount)) {
    e['loan.amount'] = `Для этого кредита — от ${formatMoney(product.minAmount)} до ${formatMoney(product.maxAmount)}`;
  }
  if (loan.termMonths === null) e['loan.termMonths'] = 'Выберите срок';
  else if (product && !product.terms.includes(loan.termMonths)) e['loan.termMonths'] = 'Выберите срок из списка';
  if (!loan.purpose) e['loan.purpose'] = 'Выберите цель';
  if (loan.purpose === 'OTHER' && loan.purposeComment.trim().length < 5) {
    e['loan.purposeComment'] = 'Расскажите в двух словах, на что пойдут деньги';
  }
  return e;
}

export function validateCompany(c: CompanySection, contacts: ContactsSection, today: string): FieldErrors {
  const e: FieldErrors = {};
  const isOoo = c.legalForm === 'OOO';

  if (!c.name.trim()) e['company.name'] = REQUIRED;

  if (!c.inn) e['company.inn'] = REQUIRED;
  else if (isOoo && !/^\d{10}$/.test(c.inn)) e['company.inn'] = 'ИНН компании — 10 цифр';
  else if (!isOoo && !/^\d{12}$/.test(c.inn)) e['company.inn'] = 'ИНН предпринимателя — 12 цифр';
  else if (!isValidInn(c.inn)) e['company.inn'] = 'В ИНН ошибка — проверьте цифры';

  const ogrnLen = isOoo ? 13 : 15;
  if (!c.ogrn) e['company.ogrn'] = REQUIRED;
  else if (c.ogrn.length !== ogrnLen || !/^\d+$/.test(c.ogrn)) e['company.ogrn'] = `${isOoo ? 'ОГРН' : 'ОГРНИП'} — ${ogrnLen} цифр`;
  else if (!isValidOgrn(c.ogrn)) e['company.ogrn'] = 'В номере ошибка — проверьте цифры';

  if (!c.okved.trim()) e['company.okved'] = REQUIRED;
  else if (!/^\d{2}(\.\d{1,2}){0,2}$/.test(c.okved.trim())) e['company.okved'] = 'Формат кода: 47.71';
  if (!c.region.trim()) e['company.region'] = REQUIRED;
  if (!c.registeredAt) e['company.registeredAt'] = REQUIRED;
  else if (c.registeredAt > today) e['company.registeredAt'] = 'Дата не может быть в будущем';
  if (c.employees === null) e['company.employees'] = REQUIRED;
  if (!c.taxSystem) e['company.taxSystem'] = 'Выберите систему налогообложения';
  else if (!(TAX_SYSTEMS_BY_FORM[c.legalForm] as readonly string[]).includes(c.taxSystem)) {
    e['company.taxSystem'] = 'Патент доступен только предпринимателям';
  }

  if (isOoo) {
    if (!isValidKpp(c.kpp)) e['company.kpp'] = 'КПП — 9 символов';
    if (words(c.directorName) < 2) e['company.directorName'] = 'Укажите фамилию и имя руководителя';
    if (c.founders.length === 0) e['company.founders'] = 'Добавьте хотя бы одного учредителя';
    let total = 0;
    c.founders.forEach((f, i) => {
      if (!f.name.trim()) e[`company.founders.${i}.name`] = REQUIRED;
      if (f.share === null || f.share <= 0 || f.share > 100) e[`company.founders.${i}.share`] = 'От 1 до 100';
      total += f.share ?? 0;
    });
    if (c.founders.length > 0 && total !== 100 && !e['company.founders']) {
      e['company.founders'] = `Сумма долей — ${total} %, а должна быть 100 %`;
    }
  } else {
    if (!c.maritalStatus) e['company.maritalStatus'] = 'Выберите вариант';
    if (c.maritalStatus === 'MARRIED' && words(c.spouseName) < 2) {
      e['company.spouseName'] = 'Укажите фамилию и имя супруга(и)';
    }
  }

  if (words(contacts.contactName) < 1) e['contacts.contactName'] = REQUIRED;
  if (!isValidPhone(contacts.phone)) e['contacts.phone'] = 'Номер в формате +7 (999) 123-45-67';
  if (!isValidEmail(contacts.email)) e['contacts.email'] = 'Проверьте адрес почты';
  return e;
}

export function validateFinance(f: FinanceSection): FieldErrors {
  const e: FieldErrors = {};
  if (f.monthlyRevenue === null || f.monthlyRevenue <= 0) e['finance.monthlyRevenue'] = 'Укажите среднюю выручку в месяц';
  if (f.monthlyExpenses === null) e['finance.monthlyExpenses'] = 'Укажите средние расходы — можно примерно';
  else if (f.monthlyRevenue && f.monthlyExpenses > f.monthlyRevenue * 2) {
    e['finance.monthlyExpenses'] = 'Расходы больше выручки в 2 раза — проверьте цифры';
  }
  if (f.hasOtherLoans && (f.otherLoansPayment === null || f.otherLoansPayment <= 0)) {
    e['finance.otherLoansPayment'] = 'Укажите, сколько платите в месяц по другим кредитам';
  }
  if ((f.collateral === 'REAL_ESTATE' || f.collateral === 'VEHICLE' || f.collateral === 'EQUIPMENT') && !f.collateralValue) {
    e['finance.collateralValue'] = 'Укажите примерную стоимость';
  }
  return e;
}

export function validateConsents(c: ConsentsSection): FieldErrors {
  const e: FieldErrors = {};
  if (!c.creditHistory) e['consents.creditHistory'] = 'Без этого согласия банк не сможет рассмотреть заявку';
  if (!c.dataProcessing) e['consents.dataProcessing'] = 'Нужно ваше согласие';
  return e;
}

/** Ошибки конкретного шага мастера. `today` — 'YYYY-MM-DD' (передаём снаружи, чтобы функция была чистой). */
export function validateStep(step: WizardStepId, form: ApplicationForm, today: string): FieldErrors {
  switch (step) {
    case 'loan':
      return validateLoan(form.loan);
    case 'company':
      return validateCompany(form.company, form.contacts, today);
    case 'finance':
      return validateFinance(form.finance);
    case 'review':
      return validateConsents(form.consents);
  }
}

/** Индекс первого шага с ошибками или -1. */
export function firstInvalidStep(form: ApplicationForm, today: string): number {
  return WIZARD_STEPS.findIndex((s) => Object.keys(validateStep(s.id, form, today)).length > 0);
}

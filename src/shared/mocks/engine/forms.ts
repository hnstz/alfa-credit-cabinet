import type { ApplicationForm, DraftPreset, FieldPath, LoanSection } from '@/entities/application';
import type { BorrowerProfile } from '../fixtures/borrowers';

/** Средние поступления за последние 6 месяцев с движением по счёту. */
export function recentAverageInflow(profile: BorrowerProfile): number {
  const active = profile.inflow.filter((v) => v > 0).slice(-6);
  if (active.length === 0) return 0;
  return active.reduce((s, v) => s + v, 0) / active.length;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Анкета, предзаполненная тем, что банк уже знает о клиенте:
 * реквизиты из профиля, обороты — по расчётному счёту, кредиты — из кредитной истории.
 */
export function buildPrefilledForm(
  profile: BorrowerProfile,
  loan: Partial<LoanSection> = {},
): ApplicationForm {
  const c = profile.company;
  const isOoo = c.legalForm === 'OOO';

  return {
    loan: { product: '', amount: null, termMonths: null, purpose: '', purposeComment: '', ...loan },
    company: {
      legalForm: c.legalForm,
      name: c.name,
      inn: c.inn,
      ogrn: c.ogrn,
      okved: c.okved,
      region: c.region,
      registeredAt: c.registeredAt,
      employees: c.employees,
      taxSystem: profile.taxSystem,
      kpp: profile.kpp ?? '',
      directorName: isOoo ? profile.director : '',
      founders: profile.founders.map((f, i) => ({ id: `f${i + 1}`, name: f.name, share: f.share })),
      maritalStatus: profile.maritalStatus ?? '',
      spouseName: profile.spouseName ?? '',
      spouseConsent: false,
    },
    finance: {
      monthlyRevenue: roundTo(recentAverageInflow(profile), 10_000) || null,
      monthlyExpenses: profile.monthlyExpenses,
      hasOtherLoans: profile.bki.monthlyPayments > 0,
      otherLoansPayment: profile.bki.monthlyPayments || null,
      collateral: 'NONE',
      collateralValue: null,
    },
    contacts: {
      contactName: profile.contacts.name,
      phone: profile.contacts.phone,
      email: profile.contacts.email,
    },
    consents: { creditHistory: false, dataProcessing: false },
  };
}

/** Какие поля заполнены «из данных банка» — в мастере рядом с ними подсказка. */
export function prefilledFields(profile: BorrowerProfile): FieldPath[] {
  const fields: FieldPath[] = [
    'company.legalForm',
    'company.name',
    'company.inn',
    'company.ogrn',
    'company.okved',
    'company.region',
    'company.registeredAt',
    'company.employees',
    'company.taxSystem',
    'finance.monthlyRevenue',
    'finance.monthlyExpenses',
    'contacts.contactName',
    'contacts.phone',
    'contacts.email',
  ];
  if (profile.company.legalForm === 'OOO') fields.push('company.kpp', 'company.directorName', 'company.founders');
  if (profile.company.legalForm === 'IP' && profile.maritalStatus) fields.push('company.maritalStatus');
  if (profile.bki.monthlyPayments > 0) fields.push('finance.hasOtherLoans', 'finance.otherLoansPayment');
  return fields;
}

export function presetToLoan(preset: DraftPreset): Partial<LoanSection> {
  const loan: Partial<LoanSection> = {};
  if (preset.product) loan.product = preset.product;
  if (preset.amount) loan.amount = preset.amount;
  if (preset.termMonths) loan.termMonths = preset.termMonths;
  return loan;
}

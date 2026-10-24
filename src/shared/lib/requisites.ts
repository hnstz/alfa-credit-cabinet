/** Проверка реквизитов по контрольным суммам ФНС. */

function weightedSum(digits: string, weights: readonly number[]): number {
  return weights.reduce((sum, w, i) => sum + w * Number(digits[i]), 0);
}

const INN10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_A = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_B = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

/** ИНН юрлица — 10 цифр, ИНН ИП/физлица — 12 цифр. */
export function isValidInn(value: string): boolean {
  if (/^\d{10}$/.test(value)) {
    return (weightedSum(value, INN10) % 11) % 10 === Number(value[9]);
  }
  if (/^\d{12}$/.test(value)) {
    const n11 = (weightedSum(value, INN12_A) % 11) % 10;
    const n12 = (weightedSum(value, INN12_B) % 11) % 10;
    return n11 === Number(value[10]) && n12 === Number(value[11]);
  }
  return false;
}

/** ОГРН — 13 цифр, ОГРНИП — 15 цифр. */
export function isValidOgrn(value: string): boolean {
  if (/^\d{13}$/.test(value)) {
    return Number((BigInt(value.slice(0, 12)) % 11n) % 10n) === Number(value[12]);
  }
  if (/^\d{15}$/.test(value)) {
    return Number((BigInt(value.slice(0, 14)) % 13n) % 10n) === Number(value[14]);
  }
  return false;
}

export function isValidKpp(value: string): boolean {
  return /^\d{4}[\dA-Z]{2}\d{3}$/.test(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Российский мобильный/городской: 11 цифр, начинается с 7. */
export function isValidPhone(value: string): boolean {
  return /^7\d{10}$/.test(value.replace(/\D/g, ''));
}

/** "79161234567" / "8 916 123..." -> "+7 (916) 123-45-67" (частичный ввод тоже форматирует). */
export function formatPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (!digits) return '';
  if (digits[0] === '8') digits = `7${digits.slice(1)}`;
  if (digits[0] !== '7') digits = `7${digits}`;
  digits = digits.slice(0, 11);

  const p = digits.slice(1);
  let out = '+7';
  if (p.length > 0) out += ` (${p.slice(0, 3)}`;
  if (p.length >= 3) out += ')';
  if (p.length > 3) out += ` ${p.slice(3, 6)}`;
  if (p.length > 6) out += `-${p.slice(6, 8)}`;
  if (p.length > 8) out += `-${p.slice(8, 10)}`;
  return out;
}

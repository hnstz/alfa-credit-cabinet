import type { FormViewSection } from '@/entities/application';

export const WIZARD_STEPS = [
  {
    id: 'loan',
    title: 'Кредит',
    description: 'Сумма и срок',
    heading: 'Сколько и на что нужно',
    lead: 'Выберите вид кредита и примерную сумму — точные условия рассчитаем после проверки.',
  },
  {
    id: 'company',
    title: 'Бизнес',
    description: 'Реквизиты и контакты',
    heading: 'О вашем бизнесе',
    lead: 'Большую часть мы уже заполнили по данным банка. Проверьте и при необходимости поправьте.',
  },
  {
    id: 'finance',
    title: 'Финансы',
    description: 'Выручка и расходы',
    heading: 'Деньги бизнеса',
    lead: 'Нужно, чтобы платёж по кредиту был посильным. Достаточно примерных цифр.',
  },
  {
    id: 'review',
    title: 'Проверка',
    description: 'Отправка заявки',
    heading: 'Проверьте и отправьте',
    lead: 'После отправки проверка займёт меньше минуты — статус будет обновляться на экране.',
  },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

export const LAST_STEP = WIZARD_STEPS.length - 1;

/** Секция просмотра анкеты -> шаг мастера (для кнопки «Изменить» на шаге проверки). */
export const SECTION_STEP: Record<FormViewSection, number> = {
  loan: 0,
  company: 1,
  contacts: 1,
  finance: 2,
};

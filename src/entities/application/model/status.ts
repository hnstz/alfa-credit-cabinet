import type { BadgeTone } from '@/shared/ui';

/**
 * ЕДИНЫЙ словарь статусов заявки.
 * Зеркалит диаграмму состояний бэкенда: если статусы меняются — меняем ТОЛЬКО здесь.
 */
export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'VALIDATION',
  'ENRICHMENT',
  'SCORING',
  'UNDER_REVIEW',
  'NEEDS_INFO',
  'APPROVED',
  'COUNTER_OFFER',
  'REJECTED',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
  'SIGNING',
  'SIGNED',
  'DISBURSED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Для кого формулируем текст: клиентский кабинет или рабочее место банка. */
export type StatusAudience = 'client' | 'bank';

/** Кто сейчас должен действовать по заявке. */
export type StatusActor = 'client' | 'bank' | 'system' | null;

/** Крупные этапы пути — для таймлайна в кабинете клиента. */
export const APPLICATION_STAGES = [
  { id: 'application', label: 'Заявка' },
  { id: 'review', label: 'Проверка' },
  { id: 'decision', label: 'Решение' },
  { id: 'closing', label: 'Оформление' },
  { id: 'disbursement', label: 'Выдача' },
] as const;

export type ApplicationStageId = (typeof APPLICATION_STAGES)[number]['id'];

interface AudienceText {
  label: string;
  description: string;
  /** Подсказка «что дальше» (если от кого-то требуется действие). */
  nextAction?: string;
}

export interface StatusMeta {
  tone: BadgeTone;
  /** null — статус вне основного пути (отмена, истечение, отказ от оффера). */
  stage: ApplicationStageId | null;
  actor: StatusActor;
  text: Record<StatusAudience, AudienceText>;
  /** Допустимые переходы — это и есть диаграмма состояний в коде. */
  next: readonly ApplicationStatus[];
}

const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  DRAFT: {
    tone: 'neutral',
    stage: 'application',
    actor: 'client',
    text: {
      client: {
        label: 'Черновик',
        description: 'Заявка сохранена, но ещё не отправлена в банк.',
        nextAction: 'Дозаполните анкету и отправьте заявку',
      },
      bank: { label: 'Черновик', description: 'Клиент ещё заполняет заявку. В работу не поступала.' },
    },
    next: ['SUBMITTED', 'CANCELLED'],
  },
  SUBMITTED: {
    tone: 'info',
    stage: 'application',
    actor: 'system',
    text: {
      client: { label: 'Заявка отправлена', description: 'Банк получил заявку и скоро начнёт проверку.' },
      bank: { label: 'Новая', description: 'Заявка поступила, ожидает первичной проверки.' },
    },
    next: ['VALIDATION', 'CANCELLED'],
  },
  VALIDATION: {
    tone: 'info',
    stage: 'review',
    actor: 'system',
    text: {
      client: { label: 'Проверяем данные', description: 'Проверяем полноту и корректность анкеты.' },
      bank: { label: 'Проверка данных', description: 'Автоматическая проверка полноты и формата полей.' },
    },
    next: ['ENRICHMENT', 'NEEDS_INFO'],
  },
  ENRICHMENT: {
    tone: 'info',
    stage: 'review',
    actor: 'system',
    text: {
      client: { label: 'Проверяем данные', description: 'Сверяем сведения о компании с официальными источниками.' },
      bank: { label: 'Обогащение данных', description: 'Запросы к БКИ, ЕГРЮЛ/ЕГРИП и ФНС (моки).' },
    },
    next: ['SCORING'],
  },
  SCORING: {
    tone: 'info',
    stage: 'review',
    actor: 'system',
    text: {
      client: { label: 'Оцениваем заявку', description: 'Рассчитываем параметры предложения для вашего бизнеса.' },
      bank: { label: 'Скоринг', description: 'Расчёт оценки риска по доступным признакам.' },
    },
    // Допускаем автоматическое решение без участия сотрудника — согласовать с бэкендом
    next: ['UNDER_REVIEW', 'APPROVED', 'COUNTER_OFFER', 'REJECTED'],
  },
  UNDER_REVIEW: {
    tone: 'info',
    stage: 'review',
    actor: 'bank',
    text: {
      client: { label: 'На рассмотрении', description: 'Специалист банка изучает вашу заявку.' },
      bank: {
        label: 'На рассмотрении',
        description: 'Заявка ждёт решения сотрудника.',
        nextAction: 'Изучите скоринг и примите решение',
      },
    },
    next: ['NEEDS_INFO', 'APPROVED', 'COUNTER_OFFER', 'REJECTED'],
  },
  NEEDS_INFO: {
    tone: 'warning',
    stage: 'review',
    actor: 'client',
    text: {
      client: {
        label: 'Нужны уточнения',
        description: 'Банку не хватает сведений, чтобы принять решение.',
        nextAction: 'Ответьте на вопросы банка',
      },
      bank: { label: 'Ждём уточнения', description: 'Запрос отправлен клиенту, ожидаем ответ.' },
    },
    next: ['UNDER_REVIEW', 'VALIDATION', 'CANCELLED'],
  },
  APPROVED: {
    tone: 'success',
    stage: 'decision',
    actor: 'client',
    text: {
      client: {
        label: 'Одобрено',
        description: 'Банк готов выдать кредит на запрошенных условиях.',
        nextAction: 'Изучите условия и примите предложение',
      },
      bank: { label: 'Одобрена', description: 'Решение принято, клиент рассматривает предложение.' },
    },
    next: ['OFFER_ACCEPTED', 'OFFER_DECLINED', 'EXPIRED'],
  },
  COUNTER_OFFER: {
    tone: 'brand',
    stage: 'decision',
    actor: 'client',
    text: {
      client: {
        label: 'Встречное предложение',
        description: 'Банк готов выдать кредит, но на других условиях.',
        nextAction: 'Сравните условия и примите решение',
      },
      bank: { label: 'Иные условия', description: 'Клиенту предложены изменённые сумма, срок или ставка.' },
    },
    next: ['OFFER_ACCEPTED', 'OFFER_DECLINED', 'EXPIRED'],
  },
  REJECTED: {
    tone: 'danger',
    stage: 'decision',
    actor: null,
    text: {
      client: {
        label: 'Отказ',
        description: 'По заявке принято отрицательное решение.',
        nextAction: 'Посмотрите причины и возможные альтернативы',
      },
      bank: { label: 'Отказ', description: 'Принято отрицательное решение.' },
    },
    next: [],
  },
  OFFER_ACCEPTED: {
    tone: 'info',
    stage: 'closing',
    actor: 'system',
    text: {
      client: { label: 'Предложение принято', description: 'Готовим документы к подписанию.' },
      bank: { label: 'Клиент принял условия', description: 'Формируется пакет документов.' },
    },
    next: ['SIGNING'],
  },
  OFFER_DECLINED: {
    tone: 'neutral',
    stage: null,
    actor: null,
    text: {
      client: { label: 'Вы отказались', description: 'Вы не приняли предложение банка.' },
      bank: { label: 'Клиент отказался', description: 'Клиент отклонил предложение.' },
    },
    next: [],
  },
  SIGNING: {
    tone: 'info',
    stage: 'closing',
    actor: 'client',
    text: {
      client: {
        label: 'Подписание',
        description: 'Документы готовы к подписанию.',
        nextAction: 'Подпишите документы (в демо — условный код)',
      },
      bank: { label: 'Подписание', description: 'Ожидаем подпись клиента.' },
    },
    next: ['SIGNED', 'CANCELLED'],
  },
  SIGNED: {
    tone: 'success',
    stage: 'closing',
    actor: 'system',
    text: {
      client: { label: 'Документы подписаны', description: 'Передаём средства на ваш счёт.' },
      bank: { label: 'Подписана', description: 'Подписание завершено, идёт выдача (симуляция).' },
    },
    next: ['DISBURSED'],
  },
  DISBURSED: {
    tone: 'success',
    stage: 'disbursement',
    actor: null,
    text: {
      client: { label: 'Кредит выдан', description: 'Средства зачислены на ваш счёт (в демо — моделирование).' },
      bank: { label: 'Выдан', description: 'Сделка завершена.' },
    },
    next: [],
  },
  CANCELLED: {
    tone: 'neutral',
    stage: null,
    actor: null,
    text: {
      client: { label: 'Отменена', description: 'Заявка отменена.' },
      bank: { label: 'Отменена', description: 'Заявка отменена.' },
    },
    next: [],
  },
  EXPIRED: {
    tone: 'neutral',
    stage: null,
    actor: null,
    text: {
      client: { label: 'Срок истёк', description: 'Предложение больше не действует. Подайте новую заявку.' },
      bank: { label: 'Срок истёк', description: 'Клиент не ответил на предложение вовремя.' },
    },
    next: [],
  },
};

/** На случай, если бэкенд пришлёт статус, которого мы не знаем: UI не должен падать. */
const UNKNOWN_META: StatusMeta = {
  tone: 'neutral',
  stage: null,
  actor: null,
  text: {
    client: { label: 'Статус уточняется', description: 'Мы обновляем информацию по заявке.' },
    bank: { label: 'Неизвестный статус', description: 'Статус не описан в словаре — проверьте контракт API.' },
  },
  next: [],
};

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function getStatusMeta(status: string): StatusMeta {
  return isApplicationStatus(status) ? STATUS_META[status] : UNKNOWN_META;
}

export function getStatusText(status: string, audience: StatusAudience): AudienceText {
  return getStatusMeta(status).text[audience];
}

export function isFinalStatus(status: string): boolean {
  const meta = getStatusMeta(status);
  return isApplicationStatus(status) && meta.next.length === 0;
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return STATUS_META[from].next.includes(to);
}

/** Индекс этапа в APPLICATION_STAGES (-1 для статусов вне основного пути). */
export function getStageIndex(status: string): number {
  const stage = getStatusMeta(status).stage;
  return stage ? APPLICATION_STAGES.findIndex((s) => s.id === stage) : -1;
}

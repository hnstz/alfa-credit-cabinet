import type { ApplicationStatus } from './status';

/**
 * Этапы кредитного конвейера: NEW -> DATA_CHECK -> ENRICHMENT -> SCORING -> DECISION.
 * Это «укрупнение» статусов из status.ts для экрана статуса заявки.
 * Тексты — для клиента: что происходит сейчас и что от него нужно.
 */
export const PIPELINE_STAGES = [
  {
    id: 'NEW',
    title: 'Заявка принята',
    active: 'Заявка в очереди на проверку',
    hint: 'Ничего делать не нужно — проверка начнётся автоматически через пару секунд.',
    statuses: ['SUBMITTED'],
  },
  {
    id: 'DATA_CHECK',
    title: 'Проверка анкеты',
    active: 'Проверяем, что анкета заполнена верно',
    hint: 'Если чего-то не хватит, мы напишем здесь и подскажем, что поправить.',
    statuses: ['VALIDATION', 'NEEDS_INFO'],
  },
  {
    id: 'ENRICHMENT',
    title: 'Сбор сведений',
    active: 'Сверяем данные о компании',
    hint: 'Смотрим сведения из налоговой и кредитную историю — вы дали на это согласие в анкете.',
    statuses: ['ENRICHMENT'],
  },
  {
    id: 'SCORING',
    title: 'Расчёт условий',
    active: 'Подбираем сумму, срок и ставку',
    hint: 'Учитываем обороты по счёту и платежи по другим кредитам, чтобы платёж был посильным.',
    statuses: ['SCORING'],
  },
  {
    id: 'DECISION',
    title: 'Решение',
    active: 'Специалист банка изучает заявку',
    hint: 'Обычно это занимает до одного рабочего дня. Мы сообщим, как только решение будет готово.',
    statuses: [
      'UNDER_REVIEW',
      'APPROVED',
      'COUNTER_OFFER',
      'REJECTED',
      'OFFER_ACCEPTED',
      'OFFER_DECLINED',
      'SIGNING',
      'SIGNED',
      'DISBURSED',
      'EXPIRED',
    ],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  active: string;
  hint: string;
  statuses: readonly ApplicationStatus[];
}[];

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id'];

/** Индекс этапа конвейера для статуса (-1 — черновик/отмена). */
export function getPipelineIndex(status: string): number {
  return PIPELINE_STAGES.findIndex((stage) =>
    (stage.statuses as readonly string[]).includes(status),
  );
}

/** Решение принято (этап DECISION пройден) — можно показывать экран решения. */
export function hasDecision(status: string): boolean {
  return (
    status === 'APPROVED' ||
    status === 'COUNTER_OFFER' ||
    status === 'REJECTED' ||
    status === 'OFFER_ACCEPTED' ||
    status === 'OFFER_DECLINED' ||
    status === 'SIGNING' ||
    status === 'SIGNED' ||
    status === 'DISBURSED' ||
    status === 'EXPIRED'
  );
}

/** Этап оформления: подписание и выдача. */
export function isClosingStage(status: string): boolean {
  return status === 'OFFER_ACCEPTED' || status === 'SIGNING' || status === 'SIGNED' || status === 'DISBURSED';
}

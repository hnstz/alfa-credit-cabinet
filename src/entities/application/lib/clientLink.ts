import { ROUTES } from '@/shared/config/routes';
import { hasDecision, isClosingStage } from '../model/pipeline';

/** Какой экран клиента открыть для заявки в этом статусе и как подписать переход. */
export function getClientApplicationLink(id: string, status: string): { to: string; label: string } {
  switch (status) {
    case 'APPROVED':
    case 'COUNTER_OFFER':
      return { to: ROUTES.client.decision(id), label: 'Посмотреть условия' };
    case 'REJECTED':
      return { to: ROUTES.client.decision(id), label: 'Что можно сделать' };
    case 'SIGNING':
      return { to: ROUTES.client.signing(id), label: 'Подписать документы' };
    default:
      if (isClosingStage(status)) return { to: ROUTES.client.signing(id), label: 'Открыть' };
      if (hasDecision(status)) return { to: ROUTES.client.decision(id), label: 'Подробнее' };
      return { to: ROUTES.client.application(id), label: 'Следить за заявкой' };
  }
}

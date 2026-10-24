import { getClientApplicationLink } from '@/entities/application';
import type { ApplicationStatusFeedItem, OfferFeedItem } from '@/entities/feed';
import { ROUTES } from '@/shared/config/routes';

/** Куда ведёт карточка статуса и как подписана кнопка. */
export function statusCardLink(item: ApplicationStatusFeedItem): { to: string; label: string } {
  if (!item.applicationId) return { to: ROUTES.client.newApplication, label: 'Продолжить анкету' };
  return getClientApplicationLink(item.applicationId, item.status);
}

/** Ссылка «Оформить» из предложения: мастер откроется с подставленными условиями. */
export function offerLink(item: OfferFeedItem): string {
  const params = new URLSearchParams({
    product: item.offer.product,
    amount: String(item.offer.amount),
    term: String(item.offer.termMonths),
  });
  return `${ROUTES.client.newApplication}?${params.toString()}`;
}

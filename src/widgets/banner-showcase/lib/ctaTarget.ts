import { getClientApplicationLink } from '@/entities/application';
import type { BannerCta } from '@/entities/banner';
import { ROUTES } from '@/shared/config/routes';

/** Куда ведёт кнопка баннера. Внешние адреса запрещены: только маршруты приложения. */
export function ctaTarget(cta: BannerCta): string {
  switch (cta.kind) {
    case 'NEW_APPLICATION': {
      const params = new URLSearchParams({
        product: cta.product,
        amount: String(cta.amount),
        term: String(cta.termMonths),
      });
      return `${ROUTES.client.newApplication}?${params.toString()}`;
    }
    case 'CONTINUE_DRAFT':
      return ROUTES.client.newApplication;
    case 'OPEN_APPLICATION':
      return getClientApplicationLink(cta.applicationId, cta.applicationStatus).to;
    case 'LINK':
      return cta.href.startsWith('/') && !cta.href.startsWith('//') ? cta.href : ROUTES.client.home;
  }
}

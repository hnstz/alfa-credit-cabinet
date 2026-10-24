import type { ApplicationStatus, ProductCode } from '@/entities/application';

/**
 * Лента новостей клиента — три типа карточек:
 * статус заявки, персональное предложение и совет на основе оборотов.
 */

interface FeedItemBase {
  id: string;
  createdAt: string;
  title: string;
  text: string;
  /** Требует действия клиента — такие карточки показываем первыми. */
  actionRequired: boolean;
}

export interface ApplicationStatusFeedItem extends FeedItemBase {
  type: 'APPLICATION_STATUS';
  /** null — карточка о незаконченном черновике. */
  applicationId: string | null;
  applicationNumber: string | null;
  status: ApplicationStatus;
}

export interface OfferFeedItem extends FeedItemBase {
  type: 'OFFER';
  offer: {
    product: ProductCode;
    amount: number;
    termMonths: number;
    ratePercent: number;
  };
  validUntil: string;
  /** Короткие преимущества: «без залога», «решение за 5 минут». */
  perks: string[];
}

export type TipTone = 'positive' | 'warning' | 'neutral';

export interface TipFeedItem extends FeedItemBase {
  type: 'TIP';
  tone: TipTone;
  /** Ключевая цифра карточки: "+12 %", "3 месяца". */
  highlight?: string;
  /** Поступления по месяцам для мини-графика. */
  series?: { month: string; value: number; flagged?: boolean }[];
  seriesLabel?: string;
  flaggedLabel?: string;
}

export type FeedItem = ApplicationStatusFeedItem | OfferFeedItem | TipFeedItem;

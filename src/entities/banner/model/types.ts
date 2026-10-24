import type { ProductCode } from '@/entities/application';

/**
 * Персональный баннер на дашборде клиента.
 * Модель выбирает, какой баннер показать, и объясняет почему (reasons);
 * тексты и условия берутся из каталога баннеров на стороне сервера.
 */

export type BannerTheme = 'brand' | 'dark' | 'positive' | 'warning';

export type BannerCta =
  /** Открыть анкету с подставленными условиями. */
  | { kind: 'NEW_APPLICATION'; label: string; product: ProductCode; amount: number; termMonths: number }
  /** Продолжить незаконченную анкету. */
  | { kind: 'CONTINUE_DRAFT'; label: string }
  /** Открыть экран заявки (куда именно — решает статус). */
  | { kind: 'OPEN_APPLICATION'; label: string; applicationId: string; applicationStatus: string }
  /** Внутренняя ссылка приложения, обязательно начинается с «/». */
  | { kind: 'LINK'; label: string; href: string };

export interface PersonalBanner {
  /** Идентификатор показа. Сменился id — это новый баннер: счётчики и «закрыть» сбрасываются. */
  id: string;
  /** Код баннера из каталога, например CREDIT_LINE_LIMIT. */
  code: string;
  modelVersion: string;
  /** 0..1 — уверенность модели. На экране не показывается, уходит в аналитику. */
  score: number;
  title: string;
  text: string;
  /** Короткая метка над заголовком: «Для вас», «Нужно действие». */
  badge?: string;
  /** Ключевая цифра справа: «до 15 млн ₽». */
  highlight?: { value: string; caption?: string };
  perks: string[];
  theme: BannerTheme;
  cta: BannerCta | null;
  /** ISO-дата, до которой действует предложение. */
  validUntil?: string;
  /** Почему клиент видит этот баннер — простым языком, для блока «Почему я это вижу». */
  reasons: string[];
}

export type BannerEventType = 'VIEW' | 'CLICK' | 'DISMISS';

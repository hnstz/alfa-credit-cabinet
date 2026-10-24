import { api } from '@/shared/api';
import type { BannerEventType, PersonalBanner } from '../model/types';

export const bannerApi = {
  /** 200 — баннер; 204 (undefined) — модель решила ничего не показывать. */
  get: (signal?: AbortSignal) => api.get<PersonalBanner | undefined>('/client/banner', { signal }),

  /** События для дообучения и аналитики. Ошибки глотаем: на UX они не влияют. */
  track: (bannerId: string, event: BannerEventType) =>
    api.post<void>('/client/banner/events', { bannerId, event }).catch(() => undefined),
};

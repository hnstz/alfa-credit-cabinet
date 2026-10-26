import { api } from '@/shared/api';
import type { BannerEventType, BannerShowcase } from '../model/types';

export const bannerApi = {
  /** Витрина дашборда: персональный баннер (или null) и классические. */
  showcase: (signal?: AbortSignal) => api.get<BannerShowcase>('/client/banners', { signal }),

  /** События для дообучения и аналитики. Ошибки глотаем: на UX они не влияют. */
  track: (bannerId: string, event: BannerEventType) =>
    api.post<void>('/client/banner/events', { bannerId, event }).catch(() => undefined),
};

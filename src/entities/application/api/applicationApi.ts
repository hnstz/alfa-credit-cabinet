import { api } from '@/shared/api';
import type {
  ApplicationDraft,
  ApplicationForm,
  ApplicationSummary,
  ClientApplication,
  DraftPreset,
  DraftSummary,
} from '../model/types';

/** API клиентского кабинета: черновик анкеты, заявки, ответ на предложение, подписание. */
export const applicationApi = {
  list: (signal?: AbortSignal) => api.get<ApplicationSummary[]>('/applications', { signal }),
  get: (id: string, signal?: AbortSignal) =>
    api.get<ClientApplication>(`/applications/${id}`, { signal }),

  // --- черновик (один на клиента) ---
  getDraft: (signal?: AbortSignal) => api.get<ApplicationDraft | null>('/applications/draft', { signal }),
  getDraftSummary: (signal?: AbortSignal) =>
    api.get<DraftSummary | null>('/applications/draft/summary', { signal }),
  /** Создаёт черновик, предзаполненный данными банка (и параметрами предложения, если пришли из ленты). */
  createDraft: (preset?: DraftPreset) => api.post<ApplicationDraft>('/applications/draft', preset ?? {}),
  saveDraft: (body: { form: ApplicationForm; step: number }) =>
    api.put<{ updatedAt: string }>('/applications/draft', body),
  deleteDraft: () => api.delete<void>('/applications/draft'),
  submitDraft: () => api.post<ClientApplication>('/applications/draft/submit'),

  // --- ответ на предложение ---
  acceptOffer: (id: string) => api.post<ClientApplication>(`/applications/${id}/offer/accept`),
  declineOffer: (id: string, reason: string) =>
    api.post<ClientApplication>(`/applications/${id}/offer/decline`, { reason }),

  // --- подписание (мок) ---
  requestSignCode: (id: string) =>
    api.post<{ phoneMask: string; demoCode: string }>(`/applications/${id}/signing/code`),
  sign: (id: string, code: string) =>
    api.post<ClientApplication>(`/applications/${id}/signing/confirm`, { code }),
};

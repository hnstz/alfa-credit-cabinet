import { api } from '@/shared/api';
import type {
  BankApplication,
  BankDecisionRequest,
  BankQueueFilters,
  BankQueueResponse,
} from '../model/bank';

/** API рабочего места сотрудника. */
export const bankApplicationApi = {
  queue: (filters: BankQueueFilters, signal?: AbortSignal) =>
    api.get<BankQueueResponse>('/bank/applications', {
      signal,
      query: {
        status: filters.status,
        risk: filters.risk.length ? filters.risk.join(',') : undefined,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        q: filters.q.trim() || undefined,
        sort: filters.sort,
      },
    }),
  get: (id: string, signal?: AbortSignal) =>
    api.get<BankApplication>(`/bank/applications/${id}`, { signal }),
  decide: (id: string, body: BankDecisionRequest) =>
    api.post<BankApplication>(`/bank/applications/${id}/decision`, body),
};

import { api } from '@/shared/api';
import type { FeedItem } from '../model/types';

export const feedApi = {
  list: (signal?: AbortSignal) => api.get<FeedItem[]>('/client/feed', { signal }),
};

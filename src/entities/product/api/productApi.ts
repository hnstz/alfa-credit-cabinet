import { api } from '@/shared/api';
import type { Product } from '../model/types';

export const productApi = {
  list: (signal?: AbortSignal) => api.get<Product[]>('/client/products', { signal }),
};

import { api } from '@/shared/api';
import type { User } from '../model/types';

export function getCurrentUser(signal?: AbortSignal): Promise<User> {
  return api.get<User>('/auth/me', { signal });
}

import { api } from '@/shared/api';
import type { LoginRequest, LoginResponse } from './types';

export const authApi = {
  // skipAuth: неверный пароль (401) не должен считаться «истекшей сессией»
  login: (body: LoginRequest) => api.post<LoginResponse>('/auth/login', body, { skipAuth: true }),
  logout: () => api.post<void>('/auth/logout'),
};

import type { User } from '@/entities/user';

export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

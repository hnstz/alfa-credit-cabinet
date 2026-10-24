import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/entities/user';
import type { User } from '@/entities/user';
import { onUnauthorized, tokenStorage } from '@/shared/api';
import { authApi } from '../api/authApi';
import type { LoginRequest } from '../api/types';
import { AuthContext } from './AuthContext';
import type { AuthStatus } from './AuthContext';

interface AuthState {
  user: User | null;
  status: AuthStatus;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Если в sessionStorage есть токен — сначала проверяем его на сервере
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    status: tokenStorage.get() ? 'loading' : 'anonymous',
  }));

  // Восстановление сессии при загрузке страницы
  useEffect(() => {
    if (!tokenStorage.get()) return;
    const controller = new AbortController();

    getCurrentUser(controller.signal)
      .then((user) => setState({ user, status: 'authenticated' }))
      .catch(() => {
        if (controller.signal.aborted) return;
        tokenStorage.clear();
        setState({ user: null, status: 'anonymous' });
      });

    return () => controller.abort();
  }, []);

  // Любой 401 от API (токен протух) — выходим из сессии
  useEffect(
    () => onUnauthorized(() => setState({ user: null, status: 'anonymous' })),
    [],
  );

  async function login(credentials: LoginRequest): Promise<User> {
    const { accessToken, user } = await authApi.login(credentials);
    tokenStorage.set(accessToken);
    setState({ user, status: 'authenticated' });
    return user;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      /* даже если сервер недоступен — локально сессию закрываем */
    }
    tokenStorage.clear();
    setState({ user: null, status: 'anonymous' });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  );
}

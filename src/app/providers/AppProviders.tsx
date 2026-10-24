import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth';

/** Сюда же позже добавим QueryClientProvider, ToastProvider и т.д. */
export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

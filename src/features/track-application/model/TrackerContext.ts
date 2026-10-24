import { createContext } from 'react';
import type { ClientApplication } from '@/entities/application';

export interface TrackerContextValue {
  application: ClientApplication | null;
  /** Ошибка последнего запроса (данные при этом могут быть — из прошлого успешного). */
  error: unknown;
  loading: boolean;
  /** Время последнего успешного обновления, мс. */
  lastUpdated: number | null;
  /** Идёт автоматическое обновление. */
  isLive: boolean;
  /** Запросить свежие данные прямо сейчас. */
  refresh: () => void;
  /** Подставить ответ мутации (принять оффер, подписать) и перезапустить опрос. */
  replace: (application: ClientApplication) => void;
}

export const TrackerContext = createContext<TrackerContextValue | null>(null);

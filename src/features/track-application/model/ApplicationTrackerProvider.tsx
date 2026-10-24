import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { applicationApi } from '@/entities/application';
import type { ClientApplication } from '@/entities/application';
import { isNotFound } from '@/shared/api';
import { getBackoff, getPollInterval } from './polling';
import { TrackerContext } from './TrackerContext';
import type { TrackerContextValue } from './TrackerContext';

interface TrackerState {
  application: ClientApplication | null;
  error: unknown;
  lastUpdated: number | null;
  /** Есть запланированный следующий опрос. */
  live: boolean;
}

/**
 * Держит актуальную заявку для всех экранов /applications/:id/* (статус, решение, подписание)
 * и опрашивает сервер с интервалом, зависящим от статуса.
 * Пока вкладка скрыта, опрос на паузе; при возврате — сразу обновляемся.
 */
export function ApplicationTrackerProvider({ id, children }: { id: string; children: ReactNode }) {
  const [state, setState] = useState<TrackerState>({
    application: null,
    error: null,
    lastUpdated: null,
    live: true,
  });
  // Смена nonce перезапускает цикл опроса с немедленным запросом
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let failures = 0;
    let stopped = false;

    const schedule = (ms: number | null) => {
      window.clearTimeout(timer);
      if (stopped || ms === null) {
        setState((s) => (s.live ? { ...s, live: false } : s));
        return;
      }
      timer = window.setTimeout(run, ms);
    };

    async function run() {
      if (document.hidden) return; // продолжим по visibilitychange
      controller?.abort();
      controller = new AbortController();
      try {
        const application = await applicationApi.get(id, controller.signal);
        failures = 0;
        setState({ application, error: null, lastUpdated: Date.now(), live: true });
        schedule(getPollInterval(application.status));
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        setState((s) => ({ ...s, error }));
        schedule(isNotFound(error) ? null : getBackoff(failures));
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        controller?.abort();
      } else {
        void run();
      }
    };

    void run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id, nonce]);

  const value: TrackerContextValue = {
    application: state.application,
    error: state.error,
    loading: state.application === null && state.error === null,
    lastUpdated: state.lastUpdated,
    isLive: state.live,
    refresh: () => setNonce((n) => n + 1),
    replace: (application) => {
      setState({ application, error: null, lastUpdated: Date.now(), live: true });
      setNonce((n) => n + 1);
    },
  };

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

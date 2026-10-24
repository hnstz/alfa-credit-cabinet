import { useEffect, useRef, useState } from 'react';

interface RequestState<T> {
  /** Ключ без версии: «что» грузили. */
  base: string;
  /** Ключ с версией: «какой именно» запрос это был. */
  requestKey: string;
  data?: T;
  error?: unknown;
}

export interface RequestResult<T> {
  data: T | undefined;
  error: unknown;
  /** Первая загрузка по текущему ключу — данных ещё нет. */
  loading: boolean;
  /** Повторная загрузка: старые данные остаются на экране. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Минимальная загрузка данных без внешних библиотек.
 * `key` описывает, что грузим: сменился ключ — запрос уходит заново, `null` — не грузим.
 * Предыдущий запрос отменяется (AbortController), состояние загрузки выводится из ключей,
 * поэтому в эффекте нет синхронных setState.
 */
export function useRequest<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): RequestResult<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<RequestState<T> | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const requestKey = key === null ? null : `${key}#${version}`;

  useEffect(() => {
    if (key === null || requestKey === null) return;
    const controller = new AbortController();

    fetcherRef.current(controller.signal).then(
      (data) => setState({ base: key, requestKey, data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // Ошибка повторной загрузки не стирает уже показанные данные
        setState((prev) => ({
          base: key,
          requestKey,
          data: prev?.base === key ? prev.data : undefined,
          error,
        }));
      },
    );

    return () => controller.abort();
  }, [key, requestKey]);

  const sameBase = state !== null && state.base === key;

  return {
    data: sameBase ? state.data : undefined,
    error: sameBase && state.requestKey === requestKey ? state.error : undefined,
    loading: key !== null && !sameBase,
    refreshing: sameBase && state.requestKey !== requestKey,
    reload: () => setVersion((v) => v + 1),
  };
}

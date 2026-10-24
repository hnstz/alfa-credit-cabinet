import { useEffect, useRef } from 'react';

/**
 * Периодически вызывает `reload` (если задан интервал) и всегда — при возврате на вкладку.
 * Пока вкладка скрыта, таймер не дёргает сервер.
 */
export function useAutoReload(reload: () => void, intervalMs: number | null) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) reloadRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);

    const timer =
      intervalMs === null
        ? undefined
        : window.setInterval(() => {
            if (!document.hidden) reloadRef.current();
          }, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}

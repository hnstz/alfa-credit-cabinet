import { useEffect, useState } from 'react';

/** Текущее время, обновляемое раз в `intervalMs`. Для «5 мин назад» и таймеров SLA. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

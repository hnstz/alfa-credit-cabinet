import { getStatusMeta, isFinalStatus } from '@/entities/application';

/**
 * Как часто опрашивать статус. Зависит от того, чей сейчас ход:
 * автоматический этап идёт секунды — опрашиваем часто; ждём сотрудника — реже;
 * ждём самого клиента — редко (на случай действий в другой вкладке); финал — не опрашиваем.
 */
export function getPollInterval(status: string): number | null {
  if (isFinalStatus(status)) return null;
  switch (getStatusMeta(status).actor) {
    case 'system':
      return 1_500;
    case 'bank':
      return 4_000;
    default:
      return 10_000;
  }
}

/** Пауза после ошибок: 2, 4, 8 … но не больше 30 секунд. */
export function getBackoff(failures: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, failures - 1));
}

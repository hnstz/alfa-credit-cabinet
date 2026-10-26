/**
 * Правило показа витрины (ml/README.md, «Показ баннеров»):
 * у каждого баннера считаем показы без реакции. С 1-го по 4-й баннер остаётся,
 * дальше скрывается. Клик по кнопке баннера обнуляет счётчик.
 *
 * Показ — одно открытие дашборда с этим баннером (автообновление не считается).
 * Счётчики лежат в localStorage отдельно для каждого пользователя: их видят все вкладки
 * и они переживают перезаход. Новый повод показа (другой id баннера) — новый счётчик.
 */

export const MAX_SHOWS_WITHOUT_REACTION = 4;

const STORAGE_KEY = 'alfa-credit:banner-shows';

/** userId → bannerId → показов без реакции. */
type ShowsByUser = Record<string, Record<string, number>>;

/** Запасной вариант, если localStorage недоступен (приватный режим и т.п.). */
let memory: ShowsByUser = {};

function readAll(): ShowsByUser {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ShowsByUser) : {};
  } catch {
    return memory;
  }
}

function writeAll(all: ShowsByUser) {
  memory = all;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* хранилище недоступно — счётчики живут в памяти */
  }
}

/** Показы без реакции по каждому баннеру пользователя. */
export function readBannerShows(userId: string): Record<string, number> {
  const mine = readAll()[userId] ?? {};
  return Object.fromEntries(Object.entries(mine).filter(([, n]) => typeof n === 'number' && Number.isFinite(n)));
}

/** Баннер ещё не исчерпал лимит показов без реакции. */
export const canShowBanner = (shows: number) => shows < MAX_SHOWS_WITHOUT_REACTION;

/** Засчитать показ. Возвращает число показов без реакции вместе с этим. */
export function registerBannerShow(userId: string, bannerId: string): number {
  const all = readAll();
  const mine = all[userId] ?? {};
  const next = (mine[bannerId] ?? 0) + 1;
  writeAll({ ...all, [userId]: { ...mine, [bannerId]: next } });
  return next;
}

/** Клиент отреагировал на баннер (клик) — считаем показы заново. */
export function resetBannerShows(userId: string, bannerId: string) {
  const all = readAll();
  const mine = { ...(all[userId] ?? {}) };
  delete mine[bannerId];
  writeAll({ ...all, [userId]: mine });
}

/** Сброс демо-данных: счётчики всех пользователей. */
export function clearBannerShows() {
  writeAll({});
}

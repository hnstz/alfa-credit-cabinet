import { clearMlScoringCache } from './engine/mlScoring';
import { advance } from './engine/pipeline';
import { createSeed, DB_VERSION, disbursementHooks } from './seed';
import type { MockDb } from './types';

/**
 * Хранилище мок-«бэкенда» в localStorage.
 * Обработчики MSW работают в каждой вкладке отдельно, а localStorage общий —
 * поэтому клиент и сотрудник банка в соседних вкладках видят одни и те же заявки.
 */

const STORAGE_KEY = 'alfa-credit:mock-db';

/** Запасной вариант, если localStorage недоступен (приватный режим и т.п.). */
let memory: MockDb | null = null;

function read(): MockDb | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as MockDb;
    return db.version === DB_VERSION ? db : null;
  } catch {
    return memory;
  }
}

function write(db: MockDb) {
  memory = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* хранилище недоступно — живём в памяти */
  }
}

/**
 * «Транзакция»: читаем свежее состояние (его могла изменить соседняя вкладка),
 * продвигаем конвейер до текущего момента, выполняем изменение и сохраняем.
 */
export function withDb<T>(fn: (db: MockDb, now: number) => T): T {
  const now = Date.now();
  const db = read() ?? createSeed(now);
  const hooks = disbursementHooks(db);
  for (const app of db.applications) advance(app, now, hooks);
  const result = fn(db, now);
  write(db);
  return result;
}

export function resetDb() {
  clearMlScoringCache();
  write(createSeed(Date.now()));
}

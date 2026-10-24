import type { ReactNode } from 'react';

/** id элемента с подсказкой/ошибкой — для aria-describedby у самого контрола. */
export function getDescribedBy(id: string, hint?: ReactNode, error?: ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

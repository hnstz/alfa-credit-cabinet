import { Badge } from '@/shared/ui';
import { getStatusMeta } from '../../model/status';
import type { StatusAudience } from '../../model/status';

export interface StatusBadgeProps {
  /** Принимаем string: бэкенд может прислать незнакомый статус — покажем нейтральную заглушку. */
  status: string;
  audience?: StatusAudience;
  size?: 's' | 'm';
  className?: string;
}

/** Цветной бейдж статуса заявки. Текст и цвет берутся из словаря статусов. */
export function StatusBadge({ status, audience = 'client', size = 'm', className }: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  const { label, description } = meta.text[audience];

  return (
    <Badge tone={meta.tone} size={size} dot title={description} className={className}>
      {label}
    </Badge>
  );
}

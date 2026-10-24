import type { UserRole } from '@/entities/user';
import { ROUTES } from '@/shared/config/routes';

export { ROUTES, ROUTE_PATTERNS } from '@/shared/config/routes';

/** Куда попадает пользователь после входа / при заходе на «чужую» страницу. */
export function getHomePath(role: UserRole): string {
  return role === 'officer' ? ROUTES.bank.queue : ROUTES.client.home;
}

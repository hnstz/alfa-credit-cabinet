import { AppShell } from './AppShell';
import type { NavItem } from './AppShell';
import { ROUTES } from '../router/paths';

const NAV: NavItem[] = [
  { to: ROUTES.client.home, label: 'Главная', end: true },
  { to: ROUTES.client.newApplication, label: 'Новая заявка' },
];

export function ClientLayout() {
  return <AppShell title="Кредиты для бизнеса" nav={NAV} />;
}

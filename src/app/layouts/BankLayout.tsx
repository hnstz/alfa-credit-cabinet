import { AppShell } from './AppShell';
import type { NavItem } from './AppShell';
import { ROUTES } from '../router/paths';

const NAV: NavItem[] = [{ to: ROUTES.bank.queue, label: 'Очередь заявок' }];

export function BankLayout() {
  return <AppShell title="Кредитный конвейер · Банк" nav={NAV} />;
}

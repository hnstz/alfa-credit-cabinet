import { useContext } from 'react';
import { WizardContext } from './WizardContext';

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard нужно вызывать внутри <WizardProvider> после загрузки черновика');
  return ctx;
}

import { createContext } from 'react';
import type { ApplicationForm, ClientApplication } from '@/entities/application';
import type { FieldErrors } from './validation';
import type { WizardState } from './wizardReducer';

export interface WizardContextValue {
  state: WizardState;
  /** Анкета (после загрузки черновика всегда есть). */
  form: ApplicationForm;
  /** Ошибки текущего шага — только если на нём уже нажимали «Далее». */
  errors: FieldErrors;
  update: <K extends keyof ApplicationForm>(section: K, patch: Partial<ApplicationForm[K]>) => void;
  isPrefilled: (path: string) => boolean;
  /** Проверяет текущий шаг и переходит дальше. false — есть ошибки. */
  next: () => boolean;
  back: () => void;
  goTo: (step: number) => void;
  /** Отправка: финальная проверка, сохранение, submit. Возвращает созданную заявку или null. */
  submit: () => Promise<ClientApplication | null>;
  retrySave: () => void;
  /** Удалить черновик и начать с чистой (предзаполненной) анкеты. */
  restart: () => Promise<void>;
}

export const WizardContext = createContext<WizardContextValue | null>(null);

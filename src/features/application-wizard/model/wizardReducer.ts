import type { ApplicationDraft, ApplicationForm } from '@/entities/application';
import { LAST_STEP } from './steps';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface WizardState {
  status: 'loading' | 'ready' | 'loadError' | 'submitting';
  loadError: string | null;
  draftId: string | null;
  form: ApplicationForm | null;
  prefilled: string[];
  step: number;
  /** На каких шагах уже нажимали «Далее» — там показываем ошибки сразу. */
  attempted: number[];
  /** Растёт при любом изменении — по нему автосохранение понимает, что есть несохранённое. */
  revision: number;
  savedRevision: number;
  saveState: SaveState;
  /** Счётчик повторов сохранения после ошибки. */
  saveAttempt: number;
  savedAt: string | null;
  submitError: string | null;
}

type SectionPatch = {
  [K in keyof ApplicationForm]: { section: K; patch: Partial<ApplicationForm[K]> };
}[keyof ApplicationForm];

export type WizardAction =
  | { type: 'loaded'; draft: ApplicationDraft }
  | { type: 'loadFailed'; message: string }
  | { type: 'reloading' }
  | ({ type: 'update' } & SectionPatch)
  | { type: 'goTo'; step: number }
  | { type: 'attempt'; step: number }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; revision: number; savedAt: string }
  | { type: 'saveFailed' }
  | { type: 'retrySave' }
  | { type: 'submitStarted' }
  | { type: 'submitFailed'; message: string }
  | { type: 'submitted' };

export const initialWizardState: WizardState = {
  status: 'loading',
  loadError: null,
  draftId: null,
  form: null,
  prefilled: [],
  step: 0,
  attempted: [],
  revision: 0,
  savedRevision: 0,
  saveState: 'idle',
  saveAttempt: 0,
  savedAt: null,
  submitError: null,
};

const clampStep = (step: number) => Math.max(0, Math.min(LAST_STEP, step));

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'loaded':
      return {
        ...initialWizardState,
        status: 'ready',
        draftId: action.draft.id,
        form: action.draft.form,
        prefilled: action.draft.prefilled,
        step: clampStep(action.draft.step),
        saveState: 'saved',
        savedAt: action.draft.updatedAt,
      };

    case 'loadFailed':
      return { ...state, status: 'loadError', loadError: action.message };

    case 'reloading':
      return initialWizardState;

    case 'update': {
      if (!state.form) return state;
      const section = action.section;
      const form = {
        ...state.form,
        [section]: { ...state.form[section], ...action.patch },
      } as ApplicationForm;
      return { ...state, form, revision: state.revision + 1, submitError: null };
    }

    case 'goTo': {
      const step = clampStep(action.step);
      if (step === state.step) return state;
      return { ...state, step, revision: state.revision + 1 };
    }

    case 'attempt':
      return state.attempted.includes(action.step)
        ? state
        : { ...state, attempted: [...state.attempted, action.step] };

    case 'saveStarted':
      return { ...state, saveState: 'saving' };

    case 'saveSucceeded':
      return {
        ...state,
        savedRevision: Math.max(state.savedRevision, action.revision),
        // Пока сохраняли, пользователь мог ещё что-то поменять
        saveState: action.revision >= state.revision ? 'saved' : 'idle',
        savedAt: action.savedAt,
      };

    case 'saveFailed':
      return { ...state, saveState: 'error' };

    case 'retrySave':
      return { ...state, saveAttempt: state.saveAttempt + 1 };

    case 'submitStarted':
      return { ...state, status: 'submitting', submitError: null };

    case 'submitFailed':
      return { ...state, status: 'ready', submitError: action.message };

    case 'submitted':
      // Черновик на сервере удалён — больше не сохраняем
      return { ...state, savedRevision: state.revision };
  }
}

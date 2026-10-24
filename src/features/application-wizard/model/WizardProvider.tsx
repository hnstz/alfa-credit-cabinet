import { useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { applicationApi } from '@/entities/application';
import type { ApplicationForm, ClientApplication, DraftPreset } from '@/entities/application';
import { getErrorMessage } from '@/shared/api';
import { Alert, Button, Card, Skeleton } from '@/shared/ui';
import { WIZARD_STEPS } from './steps';
import { firstInvalidStep, validateStep } from './validation';
import { WizardContext } from './WizardContext';
import type { WizardContextValue } from './WizardContext';
import { initialWizardState, wizardReducer } from './wizardReducer';
import type { WizardAction, WizardState } from './wizardReducer';

/** Пауза после последнего изменения, прежде чем сохранить черновик. */
const AUTOSAVE_DELAY = 800;
const SAVE_RETRY_DELAY = 5_000;

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Фокус на первое поле с ошибкой — после перерисовки. */
function focusFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[data-wizard] [aria-invalid="true"]');
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function scrollToTop() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function saveSilently(state: WizardState) {
  if (state.form && state.status === 'ready' && state.revision !== state.savedRevision) {
    void applicationApi.saveDraft({ form: state.form, step: state.step }).catch(() => undefined);
  }
}

interface WizardProviderProps {
  /** Параметры из персонального предложения (подставятся в черновик). */
  preset?: DraftPreset;
  children: ReactNode;
}

/**
 * Состояние мастера анкеты: черновик с сервера, шаги, валидация и автосохранение.
 * Данные живут здесь, а не в шагах, — поэтому переход между шагами ничего не теряет.
 */
export function WizardProvider({ preset, children }: WizardProviderProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const [loadNonce, setLoadNonce] = useState(0);
  const [today] = useState(() => toIsoDate(new Date()));
  const presetKey = preset && Object.keys(preset).length > 0 ? JSON.stringify(preset) : '';

  // 1. Загружаем черновик (или создаём новый, предзаполненный данными банка)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (presetKey) return applicationApi.createDraft(JSON.parse(presetKey) as DraftPreset);
      return (await applicationApi.getDraft()) ?? applicationApi.createDraft();
    };
    load().then(
      (draft) => {
        if (!cancelled) dispatch({ type: 'loaded', draft });
      },
      (e: unknown) => {
        if (!cancelled) dispatch({ type: 'loadFailed', message: getErrorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [presetKey, loadNonce]);

  // 2. Автосохранение: через паузу после последнего изменения
  const { status, form, step, revision, savedRevision, saveAttempt, saveState } = state;
  useEffect(() => {
    if (status !== 'ready' || !form || revision === savedRevision) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'saveStarted' });
      applicationApi.saveDraft({ form, step }).then(
        (res) => dispatch({ type: 'saveSucceeded', revision, savedAt: res.updatedAt }),
        () => dispatch({ type: 'saveFailed' }),
      );
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [status, form, step, revision, savedRevision, saveAttempt]);

  // 3. Не получилось сохранить — повторяем сами
  useEffect(() => {
    if (saveState !== 'error') return;
    const timer = window.setTimeout(() => dispatch({ type: 'retrySave' }), SAVE_RETRY_DELAY);
    return () => window.clearTimeout(timer);
  }, [saveState, saveAttempt]);

  // 4. Уходим со страницы — досохраняем то, что не успело уйти по таймеру
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    const ref = latest;
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveSilently(ref.current);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      saveSilently(ref.current);
    };
  }, []);

  if (state.status === 'loading' || !state.form) {
    if (state.status === 'loadError') {
      return (
        <Alert
          tone="danger"
          title="Не удалось открыть анкету"
          action={
            <Button
              size="s"
              variant="secondary"
              onClick={() => {
                dispatch({ type: 'reloading' });
                setLoadNonce((n) => n + 1);
              }}
            >
              Повторить
            </Button>
          }
        >
          {state.loadError}
        </Alert>
      );
    }
    return (
      <Card padding="l" aria-busy="true" aria-label="Загружаем анкету">
        <Skeleton height={28} width="40%" />
        <div style={{ height: 24 }} />
        <Skeleton variant="text" lines={4} />
        <div style={{ height: 24 }} />
        <Skeleton height={120} />
      </Card>
    );
  }

  const currentForm: ApplicationForm = state.form;
  const stepErrors = validateStep(WIZARD_STEPS[state.step].id, currentForm, today);
  const errors = state.attempted.includes(state.step) ? stepErrors : {};

  const value: WizardContextValue = {
    state,
    form: currentForm,
    errors,
    // TS не связывает дженерик K с размеченным объединением — приводим явно
    update: (section, patch) => dispatch({ type: 'update', section, patch } as WizardAction),
    isPrefilled: (path) => state.prefilled.includes(path),
    next: () => {
      dispatch({ type: 'attempt', step: state.step });
      if (Object.keys(stepErrors).length > 0) {
        focusFirstError();
        return false;
      }
      dispatch({ type: 'goTo', step: state.step + 1 });
      scrollToTop();
      return true;
    },
    back: () => {
      dispatch({ type: 'goTo', step: state.step - 1 });
      scrollToTop();
    },
    goTo: (target) => {
      dispatch({ type: 'goTo', step: target });
      scrollToTop();
    },
    submit: async (): Promise<ClientApplication | null> => {
      const invalid = firstInvalidStep(currentForm, today);
      if (invalid !== -1) {
        dispatch({ type: 'attempt', step: invalid });
        dispatch({ type: 'goTo', step: invalid });
        focusFirstError();
        return null;
      }
      dispatch({ type: 'submitStarted' });
      try {
        await applicationApi.saveDraft({ form: currentForm, step: state.step });
        const application = await applicationApi.submitDraft();
        dispatch({ type: 'submitted' });
        return application;
      } catch (e) {
        dispatch({ type: 'submitFailed', message: getErrorMessage(e, 'Не удалось отправить заявку. Попробуйте ещё раз.') });
        return null;
      }
    },
    retrySave: () => dispatch({ type: 'retrySave' }),
    restart: async () => {
      dispatch({ type: 'reloading' });
      try {
        await applicationApi.deleteDraft();
      } finally {
        setLoadNonce((n) => n + 1);
      }
    },
  };

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

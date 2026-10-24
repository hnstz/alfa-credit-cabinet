import type { PersonalBanner } from '@/entities/banner';
import { config } from '@/shared/config';
import { formatMoney, formatMoneyShort, formatMonths, formatPercent } from '@/shared/lib/format';
import type { BorrowerProfile } from '../fixtures/borrowers';
import type { MockDb } from '../types';
import { offerValidUntil } from './pipeline';
import { businessAgeMonths } from './scoring';

/**
 * Персональный баннер: «мок-бэкенд» собирает признаки клиента, спрашивает модель
 * и превращает её ответ в баннер из каталога.
 *
 *   buildBannerFeatures()  →  predictBanner()  →  renderBanner()
 *                              ^^^^^^^^^^^^^^
 *            ЕДИНСТВЕННОЕ место, где подключается ML-модель
 *            (контракт описан в docs/ML_BANNER.md)
 */

const DAY = 86_400_000;
const MODEL_TIMEOUT_MS = 3_000;
const iso = (ms: number) => new Date(ms).toISOString();

/* =========================================================
   1. Признаки — вход модели (JSON, snake_case не нужен: поля как есть)
   ========================================================= */

export interface BannerFeatures {
  company: {
    legal_form: 'OOO' | 'IP';
    okved: string;
    region: string;
    age_months: number;
    employees: number;
    annual_revenue: number;
  };
  turnover: {
    months_of_history: number;
    avg_inflow_3m: number;
    /** Изменение поступлений: последние 3 месяца против предыдущих 3, %. */
    trend_3m_pct: number;
    /** Сколько из последних 12 месяцев расходы были больше поступлений. */
    gap_months_12m: number;
  };
  bki: {
    has_history: boolean;
    rating: number | null;
    active_loans: number;
    monthly_payments: number;
    max_overdue_days: number;
    overdues_12m: number;
    requests_30d: number;
  };
  tax_debt: number;
  industry_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Платежи по кредитам / средние поступления за месяц. */
  debt_load: number;
  applications: {
    has_draft: boolean;
    draft_step: number | null;
    /** Статусы заявок, обновлявшихся за последние 60 дней, новые первыми. */
    recent_statuses: string[];
    has_active_loan: boolean;
    days_since_last_application: number | null;
  };
}

/** Заявка, вокруг которой строится баннер (нужна каталогу, но не модели). */
interface FocusApplication {
  id: string;
  status: string;
  amount: number;
  termMonths: number;
  validUntil: string | null;
}

export interface BannerContext {
  userId: string;
  companyId: string;
  features: BannerFeatures;
  focus: FocusApplication | null;
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function buildBannerContext(db: MockDb, userId: string, profile: BorrowerProfile, now: number): BannerContext {
  const apps = db.applications
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const recent = apps.filter((a) => now - new Date(a.updatedAt).getTime() < 60 * DAY);
  const draft = db.drafts[userId];

  const last3 = sum(profile.inflow.slice(-3));
  const prior3 = sum(profile.inflow.slice(-6, -3));
  const avg3 = last3 / 3;
  const monthsOfHistory = profile.inflow.filter((v) => v > 0).length;
  const gaps = profile.inflow.filter((v, i) => v > 0 && profile.outflow[i] > v).length;

  const focusApp = recent.find((a) => ['APPROVED', 'COUNTER_OFFER', 'SIGNING'].includes(a.status)) ?? null;
  const lastApp = apps[0];

  return {
    userId,
    companyId: profile.company.id,
    focus: focusApp
      ? {
          id: focusApp.id,
          status: focusApp.status,
          amount: focusApp.decision?.terms?.amount ?? focusApp.form.loan.amount ?? 0,
          termMonths: focusApp.decision?.terms?.termMonths ?? focusApp.form.loan.termMonths ?? 0,
          validUntil: offerValidUntil(focusApp),
        }
      : null,
    features: {
      company: {
        legal_form: profile.company.legalForm,
        okved: profile.company.okved,
        region: profile.company.region,
        age_months: businessAgeMonths(profile.company.registeredAt, now),
        employees: profile.company.employees,
        annual_revenue: profile.company.annualRevenue,
      },
      turnover: {
        months_of_history: monthsOfHistory,
        avg_inflow_3m: Math.round(avg3),
        trend_3m_pct: prior3 > 0 ? Math.round((last3 / prior3 - 1) * 1000) / 10 : 0,
        gap_months_12m: gaps,
      },
      bki: {
        has_history: profile.bki.hasHistory,
        rating: profile.bki.rating,
        active_loans: profile.bki.activeLoans,
        monthly_payments: profile.bki.monthlyPayments,
        max_overdue_days: profile.bki.maxOverdueDays,
        overdues_12m: profile.bki.overduesLast12m,
        requests_30d: profile.bki.requestsLast30d,
      },
      tax_debt: profile.tax.debt,
      industry_risk: profile.industryRisk,
      debt_load: avg3 > 0 ? Math.round((profile.bki.monthlyPayments / avg3) * 100) / 100 : 0,
      applications: {
        has_draft: Boolean(draft),
        draft_step: draft ? draft.step : null,
        recent_statuses: recent.map((a) => a.status),
        has_active_loan: (db.products[userId] ?? []).some((p) => p.kind === 'LOAN'),
        days_since_last_application: lastApp ? Math.floor((now - new Date(lastApp.updatedAt).getTime()) / DAY) : null,
      },
    },
  };
}

/* =========================================================
   2. Модель — вход: BannerFeatures, выход: ModelPrediction
   ========================================================= */

export interface ModelPrediction {
  /** Код баннера из каталога (BANNER_CODES). */
  banner_code: string;
  /** Уверенность 0..1. */
  score: number;
  model_version?: string;
  /** Необязательно: переопределить сумму/срок из каталога. */
  amount?: number;
  term_months?: number;
  /** Необязательно: «почему я это вижу» простым языком. Нет — берём из каталога. */
  reasons?: string[];
}

export const BANNER_CODES = [
  'ACCEPT_OFFER',
  'SIGN_DOCS',
  'CONTINUE_DRAFT',
  'CREDIT_LINE_LIMIT',
  'SEASONAL_BUFFER',
  'STARTER_LOAN',
  'GROWTH_INVEST',
  'REFINANCE',
  'CLOSE_TAX_DEBT',
  'WORKING_CAPITAL',
] as const;
export type BannerCode = (typeof BANNER_CODES)[number];

const isBannerCode = (v: unknown): v is BannerCode => BANNER_CODES.includes(v as BannerCode);

/** Валидация ответа модели: чужой JSON в UI не пускаем. */
function parsePrediction(raw: unknown): ModelPrediction | null {
  if (raw === null) return null; // модель решила ничего не показывать
  if (typeof raw !== 'object') throw new Error('ответ модели не объект');
  const r = raw as Record<string, unknown>;
  if (r.banner_code === null || r.banner_code === 'NONE') return null;
  if (!isBannerCode(r.banner_code)) throw new Error(`неизвестный banner_code: ${String(r.banner_code)}`);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    banner_code: r.banner_code,
    score: Math.min(1, Math.max(0, num(r.score) ?? 0.5)),
    model_version: typeof r.model_version === 'string' ? r.model_version : undefined,
    amount: num(r.amount),
    term_months: num(r.term_months),
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string') : undefined,
  };
}

/** Заглушка: набор правил по приоритету. Заменяется реальной моделью через BANNER_MODEL_URL. */
export function ruleBasedModel(f: BannerFeatures, focus: FocusApplication | null): ModelPrediction | null {
  const version = 'rules-stub-0.1';
  const pick = (banner_code: BannerCode, score: number, reasons: string[]): ModelPrediction => ({
    banner_code,
    score,
    model_version: version,
    reasons,
  });

  if (focus?.status === 'SIGNING') return pick('SIGN_DOCS', 0.99, ['Документы по вашей заявке ждут подписи']);
  if (focus) return pick('ACCEPT_OFFER', 0.98, ['По вашей заявке есть решение банка — оно действует ограниченное время']);
  if (f.applications.has_draft) {
    return pick('CONTINUE_DRAFT', 0.9, ['Вы начали заполнять заявку, но не отправили её']);
  }
  if (f.applications.recent_statuses.some((s) => !['REJECTED', 'DISBURSED', 'OFFER_DECLINED'].includes(s))) {
    return null; // заявка в работе — не отвлекаем предложениями
  }

  if (f.tax_debt > 0 || f.bki.max_overdue_days > 30) {
    return pick('CLOSE_TAX_DEBT', 0.85, [
      f.tax_debt > 0 ? `Есть задолженность по налогам — ${formatMoney(f.tax_debt)}` : 'В кредитной истории есть просрочка',
      'Пока это не закрыто, банк, скорее всего, откажет в новом кредите',
    ]);
  }
  if (f.debt_load >= 0.35) {
    return pick('REFINANCE', 0.8, [
      `Платежи по кредитам занимают ${formatPercent(f.debt_load * 100, 0)} ваших ежемесячных поступлений`,
      'Один кредит с длинным сроком может снизить ежемесячную нагрузку',
    ]);
  }
  if (f.company.age_months < 12 || f.turnover.months_of_history < 6) {
    return pick('STARTER_LOAN', 0.82, [
      `Бизнесу ${formatMonths(f.company.age_months)} — кредитной истории пока нет`,
      'Небольшой кредит без залога поможет её начать',
    ]);
  }
  if (f.turnover.gap_months_12m >= 2) {
    return pick('SEASONAL_BUFFER', 0.84, [
      `В ${f.turnover.gap_months_12m} из последних 12 месяцев расходы были больше поступлений`,
      'Кредитная линия закрывает такие разрывы, платите только за использованные дни',
    ]);
  }
  if (f.turnover.trend_3m_pct >= 5 && f.company.annual_revenue >= 30_000_000) {
    return pick('CREDIT_LINE_LIMIT', 0.88, [
      `Поступления за 3 месяца выросли на ${formatPercent(f.turnover.trend_3m_pct, 0)}`,
      'Стабильный рост и хорошая кредитная история — лимит рассчитан заранее',
    ]);
  }
  if (f.bki.has_history && (f.bki.rating ?? 0) >= 700 && f.turnover.trend_3m_pct >= 0) {
    return pick('GROWTH_INVEST', 0.7, ['Надёжная кредитная история и стабильные обороты', 'Подойдёт для расширения бизнеса']);
  }
  return pick('WORKING_CAPITAL', 0.55, ['Подобрали универсальный вариант под ваш профиль']);
}

/**
 * ТОЧКА ПОДКЛЮЧЕНИЯ МОДЕЛИ.
 * BANNER_MODEL_URL пустой → правила-заглушка.
 * Задан → POST features (JSON), ожидаем ModelPrediction. При любой ошибке/таймауте — откат на заглушку,
 * чтобы дашборд не ломался из-за модели.
 */
export async function predictBanner(ctx: BannerContext): Promise<ModelPrediction | null> {
  const url = config.bannerModelUrl;
  if (!url) return ruleBasedModel(ctx.features, ctx.focus);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: ctx.companyId, features: ctx.features }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const prediction = parsePrediction((await res.json()) as unknown);
    // Баннер про заявку без самой заявки показать нельзя — подстрахуемся правилами
    if (prediction && ['ACCEPT_OFFER', 'SIGN_DOCS'].includes(prediction.banner_code) && !ctx.focus) {
      throw new Error(`${prediction.banner_code} без подходящей заявки`);
    }
    return prediction && !prediction.model_version ? { ...prediction, model_version: 'remote' } : prediction;
  } catch (e) {
    console.warn('[banner] модель недоступна, используем заглушку:', e);
    return ruleBasedModel(ctx.features, ctx.focus);
  }
}

/* =========================================================
   3. Каталог — тексты и условия баннеров
   ========================================================= */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round100k = (v: number) => Math.round(v / 100_000) * 100_000;

type Draft = Omit<PersonalBanner, 'id' | 'code' | 'modelVersion' | 'score' | 'reasons'> & { reasons: string[] };

function catalogEntry(code: BannerCode, ctx: BannerContext, p: ModelPrediction, now: number): Draft {
  const f = ctx.features;
  const validUntil = iso(now + 14 * DAY);

  switch (code) {
    case 'ACCEPT_OFFER': {
      const focus = ctx.focus!;
      return {
        badge: 'Нужно действие',
        title: focus.status === 'APPROVED' ? 'Кредит одобрен — осталось оформить' : 'У банка есть предложение для вас',
        text: `${formatMoney(focus.amount)} на ${formatMonths(focus.termMonths)}. Посмотрите условия и подпишите документы онлайн.`,
        highlight: { value: formatMoneyShort(focus.amount), caption: formatMonths(focus.termMonths) },
        perks: ['Подписание онлайн', 'Деньги на счёт сразу после подписания'],
        theme: 'brand',
        cta: { kind: 'OPEN_APPLICATION', label: 'Посмотреть условия', applicationId: focus.id, applicationStatus: focus.status },
        validUntil: focus.validUntil ?? undefined,
        reasons: [],
      };
    }
    case 'SIGN_DOCS': {
      const focus = ctx.focus!;
      return {
        badge: 'Нужно действие',
        title: 'Документы готовы к подписанию',
        text: 'Подпишите их онлайн кодом из SMS — ехать в офис не нужно.',
        highlight: { value: formatMoneyShort(focus.amount) },
        perks: [],
        theme: 'dark',
        cta: { kind: 'OPEN_APPLICATION', label: 'Подписать документы', applicationId: focus.id, applicationStatus: focus.status },
        reasons: [],
      };
    }
    case 'CONTINUE_DRAFT':
      return {
        badge: 'Не закончили?',
        title: 'Заявка ждёт вас',
        text: 'Всё, что вы заполнили, сохранено. Продолжите с того же места — анкета подставит данные о компании сама.',
        perks: ['Автосохранение', 'Около 5 минут'],
        theme: 'dark',
        cta: { kind: 'CONTINUE_DRAFT', label: 'Продолжить заявку' },
        reasons: [],
      };
    case 'CREDIT_LINE_LIMIT': {
      const amount = p.amount ?? clamp(round100k(f.turnover.avg_inflow_3m * 3), 1_000_000, 15_000_000);
      const term = p.term_months ?? 24;
      return {
        badge: 'Для вас',
        title: `Кредитная линия до ${formatMoneyShort(amount)}`,
        text: 'Обороты растут — мы заранее рассчитали для вас лимит. Берите деньги частями, когда они нужны.',
        highlight: { value: `до ${formatMoneyShort(amount)}`, caption: `на ${formatMonths(term)}` },
        perks: ['Без залога', 'Проценты только за использованную сумму', 'Решение за 1 день'],
        theme: 'brand',
        cta: { kind: 'NEW_APPLICATION', label: 'Оформить линию', product: 'CREDIT_LINE', amount, termMonths: term },
        validUntil,
        reasons: [],
      };
    }
    case 'SEASONAL_BUFFER': {
      const amount = p.amount ?? clamp(round100k(f.turnover.avg_inflow_3m), 500_000, 3_000_000);
      const term = p.term_months ?? 12;
      return {
        badge: 'Для вас',
        title: 'Подушка на слабые месяцы',
        text: 'Кредитная линия закроет нехватку денег в сезонный спад. Вернули деньги — лимит снова доступен.',
        highlight: { value: `до ${formatMoneyShort(amount)}`, caption: `на ${formatMonths(term)}` },
        perks: ['Без залога', 'Платите только за дни использования'],
        theme: 'warning',
        cta: { kind: 'NEW_APPLICATION', label: 'Подключить линию', product: 'CREDIT_LINE', amount, termMonths: term },
        validUntil,
        reasons: [],
      };
    }
    case 'STARTER_LOAN': {
      const amount = p.amount ?? 500_000;
      const term = p.term_months ?? 12;
      return {
        badge: 'Для начинающих',
        title: 'Стартовый кредит до 500 000 ₽',
        text: 'Без залога и поручителей. Хороший способ начать кредитную историю — потом банк предложит больше.',
        highlight: { value: `до ${formatMoneyShort(amount)}`, caption: `на ${formatMonths(term)}` },
        perks: ['Без залога', 'Решение автоматически за пару минут'],
        theme: 'positive',
        cta: { kind: 'NEW_APPLICATION', label: 'Оформить', product: 'WORKING_CAPITAL', amount, termMonths: term },
        validUntil,
        reasons: [],
      };
    }
    case 'GROWTH_INVEST': {
      const amount = p.amount ?? clamp(round100k(f.company.annual_revenue * 0.2), 1_000_000, 20_000_000);
      const term = p.term_months ?? 36;
      return {
        badge: 'Для роста',
        title: 'Деньги на развитие бизнеса',
        text: 'Новая точка, ремонт, расширение производства: длинный срок и комфортный платёж.',
        highlight: { value: `до ${formatMoneyShort(amount)}`, caption: `на ${formatMonths(term)}` },
        perks: ['Срок до 5 лет', 'Досрочное погашение без штрафов'],
        theme: 'dark',
        cta: { kind: 'NEW_APPLICATION', label: 'Рассчитать условия', product: 'INVESTMENT', amount, termMonths: term },
        validUntil,
        reasons: [],
      };
    }
    case 'REFINANCE': {
      const amount = p.amount ?? clamp(round100k(f.bki.monthly_payments * 12), 500_000, 15_000_000);
      const term = p.term_months ?? 36;
      return {
        badge: 'Снизим платёж',
        title: 'Объедините кредиты в один',
        text: 'Один платёж вместо нескольких и больше времени на погашение — нагрузка на бизнес станет меньше.',
        highlight: { value: formatMoneyShort(amount), caption: `на ${formatMonths(term)}` },
        perks: ['Один платёж в месяц', 'Срок до 3 лет'],
        theme: 'dark',
        cta: { kind: 'NEW_APPLICATION', label: 'Рассчитать платёж', product: 'WORKING_CAPITAL', amount, termMonths: term },
        validUntil,
        reasons: [],
      };
    }
    case 'CLOSE_TAX_DEBT':
      return {
        badge: 'Совет',
        title: 'Сначала закройте долг — кредит станет доступнее',
        text: 'Задолженность по налогам или просрочка снижают шансы на одобрение. После погашения подайте заявку — анкета заполнится автоматически.',
        perks: [],
        theme: 'warning',
        cta: null,
        reasons: [],
      };
    case 'WORKING_CAPITAL': {
      const amount = p.amount ?? clamp(round100k(f.turnover.avg_inflow_3m * 2), 300_000, 5_000_000);
      const term = p.term_months ?? 12;
      return {
        badge: 'Для вас',
        title: 'Деньги на пополнение оборота',
        text: 'Закупка товара, зарплаты, аренда, налоги — решение по заявке придёт в течение дня.',
        highlight: { value: `до ${formatMoneyShort(amount)}`, caption: `на ${formatMonths(term)}` },
        perks: ['Онлайн-заявка за 5 минут'],
        theme: 'brand',
        cta: { kind: 'NEW_APPLICATION', label: 'Оформить заявку', product: 'WORKING_CAPITAL', amount, termMonths: term },
        validUntil,
        reasons: [],
      };
    }
  }
}

export function renderBanner(ctx: BannerContext, prediction: ModelPrediction, now: number): PersonalBanner {
  const code = prediction.banner_code as BannerCode;
  const entry = catalogEntry(code, ctx, prediction, now);
  // id стабилен, пока не изменился повод (заявка/статус): иначе «закрыл баннер» сбрасывался бы при каждом запросе
  const reason = ctx.focus ? `${ctx.focus.id}-${ctx.focus.status}` : ctx.companyId;
  return {
    ...entry,
    id: `${code}:${reason}`,
    code,
    modelVersion: prediction.model_version ?? 'unknown',
    score: prediction.score,
    reasons: prediction.reasons?.length ? prediction.reasons : entry.reasons,
  };
}

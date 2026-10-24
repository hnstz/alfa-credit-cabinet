import { getPipelineIndex, PIPELINE_STAGES } from '@/entities/application';
import type { FeedItem, TipFeedItem } from '@/entities/feed';
import {
  formatDayMonth,
  formatMoney,
  formatMoneyShort,
  formatMonth,
  formatMonths,
  formatPercent,
  plural,
} from '@/shared/lib/format';
import type { BorrowerProfile } from '../fixtures/borrowers';
import type { MockDb, StoredApplication } from '../types';
import { offerValidUntil } from './pipeline';
import { businessAgeMonths, lastMonthKeys } from './scoring';
import { WIZARD_STEPS } from './views';

/**
 * Лента персонализируется по двум источникам:
 * состоянию заявок клиента (меняется на глазах) и динамике оборотов по счёту.
 */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** «Сегодня в 9:00» — стабильная дата для карточек, которые генерируются на лету. */
function morning(now: number, daysAgo = 0): number {
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  const t = d.getTime() - daysAgo * DAY;
  return t > now ? t - DAY : t;
}

function statusCard(app: StoredApplication): FeedItem {
  const base = {
    id: `status-${app.id}`,
    type: 'APPLICATION_STATUS' as const,
    createdAt: app.updatedAt,
    applicationId: app.id,
    applicationNumber: app.number,
    status: app.status,
  };
  const amount = formatMoney(app.form.loan.amount ?? 0);
  const terms = app.decision?.terms;
  const until = offerValidUntil(app);

  switch (app.status) {
    case 'APPROVED':
      return {
        ...base,
        actionRequired: true,
        title: 'Кредит одобрен',
        text: `Банк готов выдать ${formatMoney(terms?.amount ?? 0)} на ${formatMonths(terms?.termMonths ?? 0)}. Предложение действует до ${until ? formatDayMonth(until) : '—'}.`,
      };
    case 'COUNTER_OFFER':
      return {
        ...base,
        actionRequired: true,
        title: 'Есть предложение на других условиях',
        text: `Можем выдать ${formatMoney(terms?.amount ?? 0)} на ${formatMonths(terms?.termMonths ?? 0)}. Сравните с тем, что вы запрашивали.`,
      };
    case 'REJECTED':
      return {
        ...base,
        actionRequired: false,
        title: 'Решение по заявке готово',
        text: `Сейчас не можем выдать ${amount}. Рассказали, что поможет получить кредит в следующий раз.`,
      };
    case 'OFFER_ACCEPTED':
      return { ...base, actionRequired: false, title: 'Готовим документы', text: 'Это займёт несколько секунд — затем их можно будет подписать онлайн.' };
    case 'SIGNING':
      return { ...base, actionRequired: true, title: 'Документы готовы к подписанию', text: 'Подпишите их онлайн кодом из SMS — ехать в офис не нужно.' };
    case 'SIGNED':
      return { ...base, actionRequired: false, title: 'Документы подписаны', text: 'Перечисляем деньги на ваш расчётный счёт.' };
    case 'DISBURSED':
      return {
        ...base,
        actionRequired: false,
        title: 'Деньги на счёте',
        text: `${formatMoney(terms?.amount ?? 0)} зачислены на расчётный счёт. Ежемесячный платёж — ${formatMoney(terms?.monthlyPayment ?? 0)}.`,
      };
    case 'OFFER_DECLINED':
      return { ...base, actionRequired: false, title: 'Вы отказались от предложения', text: 'Если передумаете — подайте новую заявку, анкета заполнится автоматически.' };
    case 'UNDER_REVIEW':
      return {
        ...base,
        actionRequired: false,
        title: 'Заявка у специалиста',
        text: 'Автоматическая проверка пройдена. Специалист банка изучает заявку — обычно это до одного рабочего дня.',
      };
    default: {
      const stage = PIPELINE_STAGES[Math.max(0, getPipelineIndex(app.status))];
      return {
        ...base,
        actionRequired: false,
        title: 'Заявка на проверке',
        text: `Сейчас: ${stage.active.toLowerCase()}. Обычно это занимает меньше минуты.`,
      };
    }
  }
}

function offerCard(profile: BorrowerProfile, now: number): FeedItem | null {
  const createdAt = iso(morning(now, 1));
  const validUntil = iso(morning(now) + 14 * DAY);
  const id = `offer-${profile.company.id}`;

  switch (profile.scenario) {
    case 'IDEAL':
      return {
        id,
        type: 'OFFER',
        createdAt,
        actionRequired: false,
        title: 'Кредитная линия до 15 млн ₽',
        text: 'Обороты стабильно растут — мы заранее рассчитали для вас лимит. Берите деньги частями, когда они нужны.',
        offer: { product: 'CREDIT_LINE', amount: 15_000_000, termMonths: 24, ratePercent: 16.9 },
        validUntil,
        perks: ['Без залога', 'Проценты только за использованную сумму', 'Решение за 1 день'],
      };
    case 'CASH_GAP':
      return {
        id,
        type: 'OFFER',
        createdAt,
        actionRequired: false,
        title: 'Подушка на слабые месяцы',
        text: 'Кредитная линия до 1,5 млн ₽ закроет нехватку денег в сезонный спад. Платите только за дни, когда пользуетесь деньгами.',
        offer: { product: 'CREDIT_LINE', amount: 1_500_000, termMonths: 12, ratePercent: 19.9 },
        validUntil,
        perks: ['Без залога', 'Вернули деньги — лимит снова доступен'],
      };
    case 'NO_HISTORY':
      return {
        id,
        type: 'OFFER',
        createdAt,
        actionRequired: false,
        title: 'Стартовый кредит до 500 000 ₽',
        text: 'Для бизнеса младше года: без залога и поручителей. Хороший способ начать кредитную историю и потом получить больше.',
        offer: { product: 'WORKING_CAPITAL', amount: 500_000, termMonths: 12, ratePercent: 24.9 },
        validUntil,
        perks: ['Без залога', 'Решение автоматически за пару минут'],
      };
    default:
      return null;
  }
}

function turnoverTips(profile: BorrowerProfile, now: number): TipFeedItem[] {
  const keys = lastMonthKeys(now);
  const tips: TipFeedItem[] = [];
  const createdAt = iso(morning(now, 2));
  const gapSet = new Set(keys.filter((_, i) => profile.inflow[i] > 0 && profile.outflow[i] > profile.inflow[i]));
  const series = keys
    .map((month, i) => ({ month, value: profile.inflow[i] ?? 0, flagged: gapSet.has(month) }))
    .filter((p) => p.value > 0);

  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const last3 = sum(profile.inflow.slice(-3));
  const prior3 = sum(profile.inflow.slice(-6, -3));
  const trend = prior3 > 0 ? (last3 / prior3 - 1) * 100 : 0;
  const ageMonths = businessAgeMonths(profile.company.registeredAt, now);
  const range = (from: number, to: number) => `${formatMonth(keys[from])}–${formatMonth(keys[to])}`;

  if (ageMonths < 12) {
    const left = 12 - series.length;
    tips.push({
      id: `tip-history-${profile.company.id}`,
      type: 'TIP',
      tone: 'neutral',
      createdAt,
      actionRequired: false,
      title: 'Копим историю оборотов',
      highlight: `${series.length} ${plural(series.length, ['месяц', 'месяца', 'месяцев'])}`,
      text: `Счёт работает ${formatMonths(series.length)}. Ещё ${formatMonths(left)} — и у вас будет годовая история: банк сможет предложить сумму больше и ставку ниже. Проводите выручку через счёт.`,
      series: series.map(({ month, value }) => ({ month, value })),
      seriesLabel: 'Поступления на счёт',
    });
  }

  if (trend >= 5) {
    tips.push({
      id: `tip-growth-${profile.company.id}`,
      type: 'TIP',
      tone: 'positive',
      createdAt,
      actionRequired: false,
      title: 'Обороты растут',
      highlight: `+${formatPercent(trend, 0)}`,
      text: `Поступления за ${range(9, 11)} выросли по сравнению с ${range(6, 8)}. Растущие обороты — весомый плюс, когда банк рассматривает заявку.`,
      series: ageMonths < 12 ? undefined : series.map(({ month, value }) => ({ month, value })),
      seriesLabel: 'Поступления на счёт',
    });
  } else if (trend <= -5) {
    tips.push({
      id: `tip-drop-${profile.company.id}`,
      type: 'TIP',
      tone: 'warning',
      createdAt,
      actionRequired: false,
      title: 'Поступления снизились',
      highlight: formatPercent(trend, 0),
      text: `За ${range(9, 11)} на счёт пришло меньше, чем за ${range(6, 8)}. Если спад сезонный — заранее подумайте, чем закрыть расходы в слабые месяцы.`,
    });
  }

  if (gapSet.size >= 2 && ageMonths >= 12) {
    const list = [...gapSet].map(formatMonth).join(', ');
    tips.push({
      id: `tip-gaps-${profile.company.id}`,
      type: 'TIP',
      tone: 'warning',
      createdAt,
      actionRequired: false,
      title: 'Сезонная нехватка денег',
      highlight: `${gapSet.size} ${plural(gapSet.size, ['месяц', 'месяца', 'месяцев'])}`,
      text: `За последний год в эти месяцы расходы были больше поступлений: ${list}. Кредитная линия поможет пройти слабый сезон без кассовых разрывов.`,
      series,
      seriesLabel: 'Поступления на счёт',
      flaggedLabel: 'Расходы больше поступлений',
    });
  }

  // Налоговый календарь — полезно всем
  const d = new Date(now);
  const due = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > 28 ? 1 : 0), 28);
  tips.push({
    id: `tip-tax-${profile.company.id}`,
    type: 'TIP',
    tone: 'neutral',
    createdAt: iso(morning(now, 3)),
    actionRequired: false,
    title: 'Не пропустите срок налогов',
    highlight: formatDayMonth(due.toISOString()),
    text: `Ближайший срок уплаты налогов и взносов — ${formatDayMonth(due.toISOString())}. Средние поступления за месяц — ${formatMoneyShort(sum(profile.inflow.slice(-3)) / 3)}: заложите сумму заранее или настройте автоплатёж.`,
  });

  return tips;
}

export function buildFeed(db: MockDb, userId: string, profile: BorrowerProfile, now: number): FeedItem[] {
  const items: FeedItem[] = [];

  const draft = db.drafts[userId];
  if (draft) {
    items.push({
      id: `draft-${draft.id}`,
      type: 'APPLICATION_STATUS',
      createdAt: draft.updatedAt,
      actionRequired: true,
      title: 'Вы не закончили заявку',
      text: `Заполнено ${draft.step} из ${WIZARD_STEPS} шагов${draft.form.loan.amount ? ` · ${formatMoney(draft.form.loan.amount)}` : ''}. Всё сохранено — продолжите с того же места.`,
      applicationId: null,
      applicationNumber: null,
      status: 'DRAFT',
    });
  }

  db.applications
    .filter((a) => a.userId === userId && now - new Date(a.updatedAt).getTime() < 60 * DAY)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3)
    .forEach((a) => items.push(statusCard(a)));

  const offer = offerCard(profile, now);
  if (offer) items.push(offer);
  items.push(...turnoverTips(profile, now));

  return items.sort(
    (a, b) => Number(b.actionRequired) - Number(a.actionRequired) || b.createdAt.localeCompare(a.createdAt),
  );
}

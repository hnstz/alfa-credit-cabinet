"""Сборка карточки предложения под конкретную роль ЛПР.

Вход — уже готовые результат скоринга, кредитное решение и базовый баннер
(personal_predlozhenie). Модель склонности решает только ОДНУ вещь: в каком формате
этой роли лучше показать это предложение. Тексты — честные шаблоны с подстановкой
цифр решения: никаких новых обещаний, никаких чисел кроме тех, что приняла Rules-
фабрика (требование объяснимости: жюри и клиент должны видеть, откуда каждая цифра).

Если lpr-модели нет — не падаем: форматы ранжируются по L1-матрице ROLE_FORMAT_PRIOR,
в ответе честно помечаем generated_by="prior".
"""
from __future__ import annotations

from personal_predlozhenie.rules import ScoreInput
from personal_predlozhenie.schemas import (Application, BannerKind, BannerResponse,
                                            DecisionResponse, Outcome)

from . import roles
from .lpr_model import LprService
from .schemas import FormatScore, LprOfferResponse

# Чем начинаем разговор с ролью, когда оффер есть (approve/counter).
OFFER_OPENERS: dict[str, str] = {
    "владелец": "Деньги под вашу задачу — коротко, три цифры и решение за вами",
    "финансовый директор": "Полные условия с расчётом — смотрите цену и нагрузку",
    "главбух": "Условия и документы — что подписать и что сдать в учёт",
    "управляющий": "Финансирование под план — что закрывает и в какие сроки",
}

# Что говорим, когда предложения нет (запрет / отказ с объяснением).
INFO_ROLE_TEXT: dict[str, str] = {
    "владелец": "Кредит пока недоступен. Как только ограничение снимем — вернёмся к заявке, ничего заново заполнять не придётся.",
    "финансовый директор": "Кредитная операция заблокирована ограничением на клиента. Обоснование и срок блокировки — в деталях, повторный скоринг не требуется.",
    "главбух": "По счёту действует ограничение на кредитование. Пакета документов для проводок нет и не будет, пока ограничение не снято.",
    "управляющий": "Финансирование по этой заявке сейчас невозможно — внешний запрет. Процесс не встаёт: продолжаем без кредитной части.",
}


def build(app: Application, decision: DecisionResponse, banner: BannerResponse,
          score: ScoreInput | None, service: LprService) -> LprOfferResponse:
    role_key = roles.normalize_role(app.lpr_role)
    profile = roles.LPR_ROLES[role_key]
    ctx = _context(app, decision)

    # ---- 1. ранжирование форматов: модель, а если её нет — L1-приоры ----
    if service.available:
        ranked = service.rank(role_key, ctx)
        generated_by, version = "model", service.metrics.get("model_version", "lpr-propensity-1.0")
    else:
        ranked = _rank_by_prior(role_key, ctx)
        generated_by, version = "prior", "l1-role-prior"

    best, second = ranked[0], (ranked[1] if len(ranked) > 1 else None)

    # ---- 2. текст: зависит от исхода решения, а не от фантазии модели ----
    name = _first_name(app.features.full_name)
    if banner.kind == BannerKind.OFFER and decision.terms:
        headline, body, emphasis = _offer_text(role_key, profile, name, decision, app)
    elif banner.kind == BannerKind.INFO:
        headline = f"{name}, кредитование приостановлено: ограничение на клиенте"
        body = INFO_ROLE_TEXT[role_key]
        emphasis = ["что заблокировало выдачу", "как снять и за какой срок", "что делать с заявкой после снятия"]
    else:  # EDUCATIONAL — мягкий отказ
        improve = [f.label for f in decision.top_factors if getattr(f, "direction", "") == "risk_up"][:3]
        headline = f"{name}, по этой заявке пока не одобрено — вот что посмотреть"
        body = ("Данные для переоценки копят в профиле, повторная заявка — в любой момент. "
                + ("Обратите внимание на: " + ", ".join(improve) + "." if improve else ""))
        emphasis = improve or ["история платежей", "долговая нагрузка", "обороты"]

    # ---- 3. «почему именно так» — объяснимость для консоли и для жюри ----
    why = [f"Роль: {profile.title}. Смотрит на: {profile.decision_lens}."]
    if second:
        why.append(f"Формат «{roles.FORMATS[best['format_code']].title}» склоннее принять: "
                   f"p={best['p_accept']:.2f} против p={second['p_accept']:.2f} у "
                   f"«{roles.FORMATS[second['format_code']].title}».")
    why.append(f"Эта же роль хуже всего реагирует на: {roles.ROLE_ANTI[role_key]}.")
    if service.available:
        shap = service.explain({**ctx, "lpr_role": role_key, "format_code": best["format_code"]})
        if shap:
            drivers = ", ".join(f"{s['label']} ({'+' if s['direction'] == 'up' else '−'})" for s in shap)
            why.append(f"Модель учитывала: {drivers}.")
    if generated_by == "prior":
        why.append("Модель склонности недоступна — формат выбран по L1-матрице ролей.")

    return LprOfferResponse(
        inn=app.features.inn,
        role_key=role_key, role_title=profile.title, decision_lens=profile.decision_lens,
        format_code=best["format_code"], format_title=roles.FORMATS[best["format_code"]].title,
        headline=headline, body=body, emphasis=emphasis,
        terms=decision.terms,
        channel=profile.channel, best_time=profile.best_time,
        p_accept=best["p_accept"],
        alternatives=[FormatScore(format_code=v["format_code"],
                                   format_title=roles.FORMATS[v["format_code"]].title,
                                   p_accept=v["p_accept"]) for v in ranked],
        why=why, model_version=version, generated_by=generated_by)


# ------------------------------ куски сборки ------------------------------

def _context(app: Application, decision: DecisionResponse) -> dict:
    """Признаки для модели склонности из заявки и решения (работают и при fallback)."""
    feats = app.features
    turnover = max(float(feats.avg_monthly_turnover or 0), 1.0)
    t = decision.terms
    amount = float(t.amount) if t else float(app.requested_amount)
    rate = float(t.rate) if t else 20.0
    term = int(t.term_months) if t else int(app.requested_term)
    pti = float(t.pti) if t else min(float(feats.existing_monthly_debt) /
                                     max(turnover * (1 - feats.expense_ratio), 20_000) + 0.3, 0.9)
    pay = float(t.monthly_payment) if t else amount / max(term, 1)
    return {
        "rate": rate,
        "term_months": term,
        "amount_to_turnover": round(amount / turnover, 3),
        "pti_after": round(min(pti, 0.95), 4),
        "payment_share": round(pay / turnover, 4),
        "n_prev_offers": 1,           # в проде — из истории показов; здесь — заглушка-дефолт
        "prev_click_rate": 0.4,
        "org_form": feats.org_form.value,
    }


def _rank_by_prior(role_key: str, ctx: dict) -> list[dict]:
    """L1-ранжирование: матрица приоров + те же контекственные поправки, что в генераторе."""
    prior = roles.ROLE_FORMAT_PRIOR[role_key]
    scores = []
    heavy = ctx["rate"] > 21 or ctx["pti_after"] > 0.4
    for f, base in prior.items():
        u = base
        if f == "расчёт" and heavy:
            u += 0.55
        if f == "расчёт" and role_key == "владелец":
            u -= 0.45
        if f == "документы" and ctx["amount_to_turnover"] > 2.5:
            u += 0.35
        if f == "польза" and ctx["term_months"] <= 12:
            u += 0.3
        if f == "короткий" and ctx["rate"] > 23:
            u -= 0.5
        scores.append((f, u))
    scores.sort(key=lambda x: -x[1])
    # из u делаем правдоподобную вероятность: сигмоида по шкале приоров
    return [{"format_code": f, "p_accept": round(float(1 / (1 + pow(2.718281828, -(u - 0.3))), 4))}
            for f, u in scores]


def _offer_text(role_key: str, profile, name: str, decision: DecisionResponse,
                app: Application) -> tuple[str, str, list[str]]:
    """Заголовок/тело/акценты оффера под роль. Цифры — только из terms решения."""
    t = decision.terms
    money = f"{t.amount:,.0f} ₽".replace(",", " ")
    pay = f"{t.monthly_payment:,.0f} ₽/мес".replace(",", " ")
    overp = f"{t.monthly_payment * t.term_months - t.amount:,.0f} ₽".replace(",", " ")
    counter = decision.outcome == Outcome.COUNTER

    if role_key == "владелец":
        lead = f"{name}, {money} под {t.rate}%"
        if counter:
            lead += f" — на {t.term_months} мес, чтобы платёж {pay} не лёг тяжело"
        else:
            lead += " — деньги в день подписания"
        body = (f"{t.product_title}. {pay}. {profile.decision_lens.split(':')[0].capitalize()}: "
                f"цель — {app.loan_purpose}. Жмёте «оформить» — дальше подписываем онлайн.")
        emphasis = [f"одобрено {money}", f"платёж {pay}", f"под цель: {app.loan_purpose}"]
    elif role_key == "финансовый директор":
        lead = f"{name}, предложение {money}: ставка {t.rate}%, нагрузка после выдачи {t.pti:.0%}"
        body = (f"{t.product_title}, {t.term_months} мес, аннуитет {pay}, переплата {overp}. "
                f"График платежей и расчёт PTI приложены — можно сверить с потоками.")
        emphasis = [f"ставка {t.rate}%", f"переплата {overp}",
                    f"PTI после выдачи {t.pti:.0%}", "график платежей"]
    elif role_key == "главбух":
        lead = f"{name}, кредит {money} под {t.rate}% — пакет документов приложен целиком"
        body = (f"{t.product_title}, {pay}, график равными платежами на {t.term_months} мес. "
                f"Договор, назначения платежей, закрывающие — всё в карточке, выгрузка в учёт.")
        emphasis = ["договор оферты", "график платежей", "назначения платежей", "закрывающие документы"]
    else:  # управляющий
        lead = f"{name}, {money} под задачу «{app.loan_purpose}»"
        body = (f"{t.product_title} на {t.term_months} мес, {pay}. "
                f"Разбивка по месяцам и влияние на оборот — внутри карточки, без визита в банк.")
        emphasis = [f"цель: {app.loan_purpose}", f"срок {t.term_months} мес — вписываемся в план",
                    "минимум отвлечений на оформление"]
    return lead, body, [e for e in emphasis if e]


def _first_name(full: str) -> str:
    parts = full.split()
    return parts[0] if parts and parts[0].isalpha() else "коллега"

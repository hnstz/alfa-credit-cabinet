"""Движок кредитного решения (правила поверх скоринга).

Ключевой принцип роли: скоринг ≠ решение. Порядок:
  1) ЖЁСТКИЙ RULE-GATE: запрет на кредиты (самозапрет / запрет банка / приставы) —
     отказ БЕЗ консультации модели. Это и есть «наложить ограничение правилами».
  2) Регуляторная элигибилитность (возраст, холодный старт).
  3) Модельный риск-грейд (D → отказ с объяснением «что улучшить»).
  4) Доступность по долговой нагрузке (PTI) + лимиты продукта → три исхода:
     одобрение / встречное предложение (меньше сумма или длиннее срок) / отказ.
Fallback: если модель недоступна, грейд считается эвристикой L1 (не падаем).
"""
from __future__ import annotations

from dataclasses import dataclass

from . import config
from .schemas import (Application, BanSource, CreditTerms, DecisionResponse,
                      Outcome, RiskGrade)

BAN_REASONS: dict[BanSource, str] = {
    BanSource.SELF: ("Действует добровольный самозапрет на кредиты (установлен клиентом "
                    "через Госуслуги). Пока запрет активен, выдача кредита невозможна."),
    BanSource.BANK: ("Банком установлен запрет на кредитование по данному клиенту. "
                     "Требуется review на консоли с указанием причины и снятием запрета."),
    BanSource.BAILIFF: ("Зафиксировано ограничение у судебных приставов / арест счетов. "
                        "Кредитование недоступно до снятия ограничения."),
}


# ------------------------------ фин. математика ------------------------------

def monthly_payment(principal: float, annual_rate_pct: float, months: int) -> float:
    """Аннуитетный платёж."""
    if months <= 0 or principal <= 0:
        return 0.0
    i = annual_rate_pct / 100.0 / 12.0
    if i == 0:
        return principal / months
    return principal * i / (1 - (1 + i) ** (-months))


def max_principal(payment_budget: float, annual_rate_pct: float, months: int) -> float:
    """Максимальный кредит, чей платёж не превышает budget."""
    if payment_budget <= 0 or months <= 0:
        return 0.0
    i = annual_rate_pct / 100.0 / 12.0
    if i == 0:
        return payment_budget * months
    return payment_budget * (1 - (1 + i) ** (-months)) / i


def _income_proxy(feats: dict) -> float:
    turnover = float(feats.get("avg_monthly_turnover", 0) or 0)
    expense = float(feats.get("expense_ratio", 0.7) or 0.7)
    return max(turnover * (1.0 - expense), 20_000.0)


def _rate_for_grade(grade: str, pd_val: float, product_spread: float) -> float:
    """Ставка = ключевая + спред грейда (интерполяция по PD) + спред продукта."""
    lo, hi = config.GRADE_RATE_SPREAD[grade]
    bounds = {"A": (0.0, 0.04), "B": (0.04, 0.09), "C": (0.09, 0.16)}[grade]
    frac = 0.5
    if bounds[1] > bounds[0]:
        frac = min(max((pd_val - bounds[0]) / (bounds[1] - bounds[0]), 0.0), 1.0)
    spread = lo + (hi - lo) * frac
    return round(config.get_settings().key_rate + spread + product_spread, 1)


# ------------------------------ L1 matching ------------------------------

PURPOSE_TO_PRODUCT = {
    "пополнение оборотных средств": "WORKING",
    "кассовый разрыв": "OVERDRAFT",
    "оборудование/развитие": "INVEST",
    "регулируемые закупки": "CREDIT_LINE",
    "снижение нагрузки по долгам": "REFA",
}


def match_product(app: Application) -> config.Product:
    """L1 decision table: цель + оргформа + сумма → продукт. Конфиг, не «умный» ML."""
    feats = app.features
    if app.preferred_product and app.preferred_product in config.PRODUCTS:
        prod = config.PRODUCTS[app.preferred_product]
        if feats.org_form.value in prod.org_forms:
            return prod
    code = PURPOSE_TO_PRODUCT.get(app.loan_purpose, "WORKING")
    prod = config.PRODUCTS.get(code, config.PRODUCTS["WORKING"])
    if feats.org_form.value not in prod.org_forms:
        prod = config.PRODUCTS["WORKING"]
    # слишком крупная сумма для продукта → более «вместительный»
    if app.requested_amount > prod.max_amount:
        bigger = max((p for p in config.PRODUCTS.values()
                      if feats.org_form.value in p.org_forms),
                     key=lambda p: p.max_amount)
        prod = bigger
    return prod


def fallback_grade(feats: dict) -> tuple[str, float]:
    """Эвристика L1, если ML-сервис недоступен (отказоустойчивость)."""
    bkii = float(feats.get("bkii_score", 700) or 700)
    ovd90 = float(feats.get("overdue_90d_count", 0) or 0)
    pti = float(feats.get("pti_current", 0) or 0)
    years = float(feats.get("years_in_business", 0) or 0)
    score = 0.14
    score += 0.02 * (750 - bkii) / 50
    score += 0.06 * ovd90
    score += 0.05 * pti
    score -= 0.02 * min(years, 5)
    score = min(max(score, 0.005), 0.6)
    for grade, bound in config.RISK_GRADE_BOUNDS:
        if score < bound:
            return grade, round(score, 4)
    return "D", round(score, 4)


# ------------------------------ основное решение ------------------------------

@dataclass
class ScoreInput:
    """То, что передаёт скоринг: pd + грейд + top_factors. Может отсутствовать (fallback)."""
    pd: float
    risk_grade: str
    top_factors: list


def decide(app: Application, score: ScoreInput | None, feats: dict) -> DecisionResponse:
    feats = dict(feats)
    ban_active = app.ban.active

    # ---------- 1. жёсткий rule-gate: запрет на кредиты ----------
    if ban_active:
        reason = BAN_REASONS.get(app.ban.source, "Действует запрет на кредитование.")
        pd_val = score.pd if score else 0.0
        grade = score.risk_grade if score else "D"
        return DecisionResponse(
            inn=app.features.inn,
            outcome=Outcome.REJECT,
            risk_grade=RiskGrade(grade),
            pd=pd_val,
            is_banned=True,
            terms=None,
            reasons=[reason],
            reject_codes=[f"CREDIT_BAN_{app.ban.source.value}"],
            top_factors=score.top_factors if score else [],
        )

    # ---------- fallback, если модель не дала скор ----------
    if score is None:
        grade, pd_val = fallback_grade(feats)
        top_factors = []
    else:
        grade, pd_val, top_factors = score.risk_grade, score.pd, score.top_factors

    reasons: list[str] = []
    reject_codes: list[str] = []

    # ---------- 2. регуляторная элигибилитность ----------
    age = int(feats.get("applicant_age", 0) or 0)
    if age < config.MIN_AGE_YEARS or age > config.MAX_AGE_YEARS:
        return _reject(app, grade, pd_val, top_factors,
                       ["Возраст заявителя вне диапазона кредитования."], ["AGE_INELIGIBLE"])

    if float(feats.get("years_in_business", 0) or 0) < config.MIN_YEARS_IN_BUSINESS:
        return _reject(app, grade, pd_val, top_factors,
                       ["Бизнес менее 6 месяцев — холодный старт, истории для решения "
                        "недостаточно. Рекомендуем начать с малого лимита после "
                        "накопления оборотов."], ["COLD_START"])

    # ---------- 3. высокий риск по модели ----------
    if grade == "D":
        improve = [f.text for f in top_factors if getattr(f, "direction", "") == "risk_up"][:3]
        reasons = ["Оценка риска выше допустимого порога."]
        if improve:
            reasons.append("Что улучшит вероятность: " + "; ".join(improve))
        return _reject(app, grade, pd_val, top_factors, reasons, ["HIGH_RISK_GRADE_D"])

    # ---------- 4. доступность по PTI + лимиты продукта → три исхода ----------
    prod = match_product(app)
    income = _income_proxy(feats)
    pti_cap = config.PTI_CAP.get(grade, 0.40)
    existing_debt = float(feats.get("existing_monthly_debt", 0) or 0)
    budget = max(income * pti_cap - existing_debt, 0.0)

    rate = _rate_for_grade(grade, pd_val, prod.base_spread)
    req_amount = float(app.requested_amount)
    req_term = int(app.requested_term)
    req_term = min(max(req_term, prod.min_term), prod.max_term)

    pay_at_req = monthly_payment(req_amount, rate, req_term)
    afford_amount = max_principal(budget, rate, req_term)
    cap_amount = min(prod.max_amount, afford_amount)

    # 4a. Запрошенное влезает в бюджет и лимиты → одобрение
    if pay_at_req <= budget + 1 and req_amount <= prod.max_amount:
        amount = min(req_amount, prod.max_amount)
        pti_after = (existing_debt + monthly_payment(amount, rate, req_term)) / income
        terms = _terms(prod, amount, req_term, rate, income, existing_debt)
        reasons = [f"Низкий/приемлемый риск (грейд {grade}), PD {pd_val:.1%}, "
                   f"PTI после выдачи {pti_after:.0%} ≤ {pti_cap:.0%}."]
        return DecisionResponse(
            inn=app.features.inn, outcome=Outcome.APPROVE, risk_grade=RiskGrade(grade),
            pd=pd_val, is_banned=False, terms=terms, reasons=reasons,
            reject_codes=[], top_factors=top_factors)

    # 4b. Попробуем растянуть срок — спасает ли это сумму?
    if budget > 0:
        afford_at_maxterm = max_principal(budget, rate, prod.max_term)
        if req_amount <= min(prod.max_amount, afford_at_maxterm):
            amount = min(req_amount, prod.max_amount)
            terms = _terms(prod, amount, prod.max_term, rate, income, existing_debt)
            reasons = [f"Запрошенную сумму проходим только на максимальном сроке "
                       f"({prod.max_term} мес) — встречаем предложением с удлинённым сроком."]
            return DecisionResponse(
                inn=app.features.inn, outcome=Outcome.COUNTER, risk_grade=RiskGrade(grade),
                pd=pd_val, is_banned=False, terms=terms, reasons=reasons,
                reject_codes=[], top_factors=top_factors)

        # 4c. Уменьшаем сумму (и, при необходимости, срок) → встречное
        counter_amount = min(prod.max_amount, afford_amount, cap_amount)
        counter_amount = _round_down(counter_amount, 0.0, prod.max_amount)
        if counter_amount >= config.COUNTER_MIN_RATIO * req_amount and counter_amount >= 100_000:
            c_term = min(max(req_term, prod.min_term), prod.max_term)
            while (monthly_payment(counter_amount, rate, c_term) > budget and c_term < prod.max_term):
                c_term += 3
            terms = _terms(prod, counter_amount, c_term, rate, income, existing_debt)
            pti_after = (existing_debt + terms.monthly_payment) / income
            reasons = [f"Запрошенная сумма не проходит по долговой нагрузке "
                       f"(PTI-лимит {pti_cap:.0%}). Предлагаем {counter_amount:,.0f} ₽ — "
                       f"PTI после выдачи {pti_after:.0%}."]
            return DecisionResponse(
                inn=app.features.inn, outcome=Outcome.COUNTER, risk_grade=RiskGrade(grade),
                pd=pd_val, is_banned=False, terms=terms, reasons=reasons,
                reject_codes=[], top_factors=top_factors)

    # 4d. Не проходит даже минимальная сумма → отказ с объяснением
    improve = [f.text for f in top_factors if getattr(f, "direction", "") == "risk_up"][:2]
    reasons = ["Запрошенный платёж недоступен при текущей долговой нагрузке."]
    if improve:
        reasons.append("Снизьте нагрузку или увеличьте оборот: " + "; ".join(improve))
    return _reject(app, grade, pd_val, top_factors, reasons, ["PTI_UNAFFORDABLE"])


def _terms(prod: config.Product, amount: float, term: int, rate: float,
           income: float, existing_debt: float) -> CreditTerms:
    pay = monthly_payment(amount, rate, term)
    return CreditTerms(
        product_code=prod.code, product_title=prod.title,
        amount=round(amount, 0), term_months=term, rate=rate,
        monthly_payment=round(pay, 0),
        pti=round((existing_debt + pay) / income, 3))


def _round_down(amount: float, lo: float, hi: float) -> float:
    amount = min(max(amount, lo), hi)
    return float(int(amount // 10_000 * 10_000))  # округляем до 10 тыс вниз


def _reject(app: Application, grade: str, pd_val: float, top_factors: list,
            reasons: list[str], codes: list[str]) -> DecisionResponse:
    return DecisionResponse(
        inn=app.features.inn, outcome=Outcome.REJECT, risk_grade=RiskGrade(grade),
        pd=pd_val, is_banned=False, terms=None, reasons=reasons,
        reject_codes=codes, top_factors=top_factors)

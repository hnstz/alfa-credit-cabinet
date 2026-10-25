"""Генератор синтетики + единая схема признаков.

Принцип из roles.md: реальных данных нет — не имитируем «всерьёз обученную банковскую
модель», а показываем методику: признаки → ground-truth риск-функция → дефолт → модель.
Воспроизводимо по seed. 10–20k записей, укладывается в RAM (<50 МБ).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# ---- Схема числовых признаков (порядок важен для модели) ----
NUMERIC_FEATURES: list[str] = [
    "years_in_business",
    "employees",
    "annual_revenue",
    "avg_monthly_turnover",
    "net_profit_margin",
    "expense_ratio",
    "active_loans",
    "existing_monthly_debt",
    "bkii_score",
    "overdue_30d_max_days",
    "overdue_90d_count",
    "applicant_age",
    "cash_gap_flag",
    "has_collateral",
    "pti_current",
    "requested_amount",
    "requested_term",
    "loan_to_turnover",
]

CAT_FEATURES: list[str] = ["org_form", "sector", "loan_purpose"]

# Все колонки, необходимые модели (числовые + кат.)
MODEL_FEATURES: list[str] = NUMERIC_FEATURES + CAT_FEATURES

# Human-readable подписи признаков — для объяснимости и баннеров.
FEATURE_LABELS: dict[str, str] = {
    "years_in_business": "возраст бизнеса",
    "employees": "численность сотрудников",
    "annual_revenue": "годовая выручка",
    "avg_monthly_turnover": "среднемесячный оборот (динамика ден. потоков)",
    "net_profit_margin": "маржинальность прибыли",
    "expense_ratio": "доля расходов в обороте",
    "active_loans": "активные кредитные обязательства",
    "existing_monthly_debt": "текущий ежемесячный платёж по долгам",
    "bkii_score": "оценка БКИ",
    "overdue_30d_max_days": "макс. просрочка 30+ (дней)",
    "overdue_90d_count": "число просрочек 90+",
    "applicant_age": "возраст заявителя",
    "cash_gap_flag": "кассовый разрыв",
    "has_collateral": "наличие залога",
    "pti_current": "текущая долговая нагрузка (PTI)",
    "requested_amount": "запрошенная сумма",
    "requested_term": "запрошенный срок",
    "loan_to_turnover": "отношение кредита к обороту",
    "org_form": "организационно-правовая форма",
    "sector": "отрасль",
    "loan_purpose": "цель финансирования",
}

SECTORS = [
    "Розничная торговля", "Общепит", "Производство", "Грузоперевозки",
    "Строительство", "IT и услуги", "Медицина", "Сельское хозяйство", "Красота и сервис",
]
PURPOSES = [
    "пополнение оборотных средств", "кассовый разрыв", "оборудование/развитие",
    "регулируемые закупки", "снижение нагрузки по долгам",
]
ORG_FORMS = ["ИП", "ООО", "Самозанятый"]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate_dataset(n: int = 15000, seed: int = 42) -> pd.DataFrame:
    """Синтетический датасет заявок МСП с ground-truth PD, флагом дефолта и запретами."""
    rng = np.random.default_rng(seed)

    org_form = rng.choice(ORG_FORMS, size=n, p=[0.5, 0.42, 0.08])
    sector = rng.choice(SECTORS, size=n, p=[0.2, 0.13, 0.15, 0.1, 0.11, 0.1, 0.06, 0.07, 0.08])
    purpose = rng.choice(PURPOSES, size=n,
                         p=[0.36, 0.19, 0.18, 0.12, 0.15])

    # возраст бизнеса: смесь зрелых и «холодного старта»
    years = np.clip(rng.gamma(2.2, 1.7, n), 0.1, 25.0)
    employees = np.clip(rng.poisson(6, n) + (years > 3), 0, 120).astype(int)

    # масштаб бизнеса коррелирует с возрастом/сотрудниками
    base_turnover = np.exp(rng.normal(10.4, 0.9, n))          # ₽/мес оборот
    turnover = base_turnover * (0.6 + 0.2 * np.log1p(years)) * (0.8 + 0.05 * employees)
    turnover = np.clip(turnover, 80_000, 60_000_000)
    annual_revenue = turnover * 12

    net_profit_margin = np.clip(rng.normal(0.10, 0.11, n), -0.15, 0.45)
    expense_ratio = np.clip(1.0 - np.maximum(net_profit_margin, 0.01) - rng.normal(0.02, 0.05, n), 0.3, 1.05)

    active_loans = np.clip(rng.poisson(0.9, n), 0, 8).astype(int)
    existing_monthly_debt = active_loans * np.clip(rng.normal(90_000, 50_000, n), 0, 600_000)

    # кредитная история
    overdue_90d_count = rng.binomial(3, np.clip(0.03 + 0.05 * (active_loans / 8), 0, 0.4), n)
    overdue_30d_max_days = np.where(overdue_90d_count > 0,
                                     rng.integers(31, 180, n),
                                     rng.binomial(1, 0.2, n) * rng.integers(1, 30, n))
    bkii_score = np.clip(
        810 - 40 * overdue_90d_count - 8 * (overdue_30d_max_days > 0)
        - 30 * (existing_monthly_debt / 300_000) + rng.normal(0, 45, n),
        350, 940,
    ).astype(int)

    applicant_age = np.clip(rng.normal(41, 12, n), 19, 74).astype(int)

    # кассовый разрыв чаще у низкомаржинальных и молодых
    gap_p = np.clip(0.10 + 0.25 * (years < 1) + np.maximum(0.05 - net_profit_margin, 0) * 3, 0, 0.7)
    cash_gap_flag = rng.binomial(1, gap_p, n)
    has_collateral = rng.binomial(1, np.clip(0.25 + 0.15 * (years > 4), 0, 0.7), n)

    # запрашиваемые параметры кредита
    requested_amount = turnover * np.clip(rng.lognormal(0.0, 0.7, n), 0.3, 6.0)
    requested_amount = np.round(np.clip(requested_amount, 200_000, 40_000_000), -4)
    requested_term = rng.choice([3, 6, 12, 18, 24, 36, 48, 60], size=n,
                                p=[0.08, 0.14, 0.22, 0.14, 0.16, 0.14, 0.07, 0.05]).astype(int)

    monthly_income_proxy = np.maximum(turnover * (1.0 - expense_ratio), 20_000)
    pti_current = np.clip(existing_monthly_debt / monthly_income_proxy, 0, 1.5)
    loan_to_turnover = requested_amount / np.maximum(turnover, 1)

    # ---------------- ground-truth риск-функция ----------------
    z = (
        -0.9 * (bkii_score - 760) / 100
        - 0.7 * np.log1p(years)
        + 0.8 * pti_current
        + 1.1 * overdue_90d_count
        + 0.5 * (overdue_30d_max_days >= 30)
        + 0.7 * (expense_ratio - 0.72) * 3
        - 0.6 * net_profit_margin * 4
        + 0.5 * cash_gap_flag
        - 0.5 * has_collateral
        + 0.35 * np.clip(loan_to_turnover - 2.5, 0, 5)
        - 0.15 * (employees >= 5)
        + 0.6 * (applicant_age < 24)
        - 0.3 * (applicant_age > 55)
    )
    # отрасль/продукт — точечные надбавки риска
    sector_risk = {
        "Общепит": 0.35, "Строительство": 0.2, "Грузоперевозки": 0.25,
        "Розничная торговля": 0.0, "Производство": -0.05, "IT и услуги": -0.2,
        "Медицина": -0.1, "Сельское хозяйство": 0.3, "Красота и сервис": 0.1,
    }
    purpose_risk = {
        "кассовый разрыв": 0.3, "оборудование/развитие": -0.1,
        "пополнение оборотных средств": 0.0, "регулируемые закупки": -0.15,
        "снижение нагрузки по долгам": 0.1,
    }
    of_risk = {"Самозанятый": 0.4, "ИП": 0.1, "ООО": -0.1}
    z = (z
         + np.vectorize(sector_risk.get)(sector)
         + np.vectorize(purpose_risk.get)(purpose)
         + np.vectorize(of_risk.get)(org_form)
         + rng.normal(0, 0.6, n))

    pd_true = _sigmoid(z - 1.9)                # базовая дефолтность ~ умеренная (~10-13%)
    default = rng.binomial(1, pd_true)

    # ---------------- запреты на кредиты (rule-gate, не фича модели) ----------------
    ban_source = rng.choice(
        ["none", "self", "bank", "bailiff"], size=n, p=[0.92, 0.04, 0.025, 0.015])

    months = rng.integers(0, 24, n)             # для time-based split и PSI

    # Платёжное поведение для выбора цели баннера: налоговый долг и тренд оборота.
    # Отдельный поток случайности, чтобы уже обученная выборка не сдвинулась.
    aux = np.random.default_rng(seed + 101)
    # Налоговый долг бывает и у здорового бизнеса: с просрочкой 90+ он чаще.
    tax_p = np.clip(0.025 + 0.15 * (overdue_90d_count > 0), 0, 0.5)
    tax_hit = aux.random(n) < tax_p
    tax_debt = np.where(tax_hit, np.round(aux.uniform(40_000, 900_000, n), -3), 0.0)
    turnover_trend = np.round(aux.normal(0.0, 12.0, n), 1)

    df = pd.DataFrame({
        "inn": [f"{7700000000 + i:010d}" for i in range(n)],
        "org_form": org_form,
        "sector": sector,
        "loan_purpose": purpose,
        "years_in_business": np.round(years, 2),
        "employees": employees,
        "annual_revenue": np.round(annual_revenue, 0),
        "avg_monthly_turnover": np.round(turnover, 0),
        "net_profit_margin": np.round(net_profit_margin, 4),
        "expense_ratio": np.round(expense_ratio, 4),
        "active_loans": active_loans,
        "existing_monthly_debt": np.round(existing_monthly_debt, 0),
        "bkii_score": bkii_score,
        "overdue_30d_max_days": overdue_30d_max_days,
        "overdue_90d_count": overdue_90d_count,
        "applicant_age": applicant_age,
        "cash_gap_flag": cash_gap_flag,
        "has_collateral": has_collateral,
        "pti_current": np.round(pti_current, 4),
        "requested_amount": requested_amount,
        "requested_term": requested_term,
        "loan_to_turnover": np.round(loan_to_turnover, 3),
        "applicant_name": _demo_names(rng, n),
        "pd_true": np.round(pd_true, 5),
        "default": default,
        "ban_source": ban_source,
        "month_idx": months,
        "tax_debt": tax_debt,
        "turnover_trend_3m_pct": turnover_trend,
    })
    return df


def _demo_names(rng: np.random.Generator, n: int) -> np.ndarray:
    first = ["Алексей", "Мария", "Дмитрий", "Анна", "Игорь", "Елена", "Сергей", "Ольга",
             "Павел", "Татьяна", "Никита", "Юлия"]
    last = ["Смирнов", "Иванова", "Кузнецов", "Попова", "Соколов", "Лебедева",
            "Козлов", "Новикова", "Морозов", "Волкова"]
    i0 = rng.integers(0, len(first), n)
    i1 = rng.integers(0, len(last), n)
    return np.array([f"{first[b]} {last[a]}" for a, b in zip(i1, i0)])

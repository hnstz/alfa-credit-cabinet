"""Синтетическая история взаимодействий «предложение × роль ЛПР × формат подачи».

Реальных логов переписки с клиентами у хакатонной команды нет, поэтому — так же,
как со скорингом, честная синтетика с ground-truth: у каждой роли есть «встроенная»
склонность к формату (ROLE_FORMAT_PRIOR из roles.py), на неё накладываются контекст
сделки и поведение человека в прошлом. Отсюда генерим отклик «принял / не принял»
и учим модель её воспроизводить. Воспроизводимо по seed.

Что изображаем реалистично:
- предложения приходят разным бизнесам с разными параметрами (ставка/нагрузка/сумма);
- у человека есть история: сколько офферов уже видели, как часто кликал;
- «баннерная слепота»: чем больше показов без интереса, тем ниже отклик;
- чем дороже кредит и выше нагрузка — тем больше ценят формат с расчётом.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .roles import FORMATS, LPR_ROLES, ROLE_FORMAT_PRIOR

# Признаки модели склонности. Числовые — про сделку и про историю человека.
LPR_NUMERIC: list[str] = [
    "rate",                    # годовая ставка, %
    "term_months",             # срок, мес
    "amount_to_turnover",      # сумма относительно месячного оборота, раз
    "pti_after",               # долговая нагрузка после выдачи, доля
    "payment_share",           # ежемесячный платёж / оборот, доля
    "n_prev_offers",           # сколько предложений этот ЛПР уже видел
    "prev_click_rate",         # как часто открывал/кликал прежние (0..1)
]
LPR_CATEGORICAL: list[str] = ["lpr_role", "format_code", "org_form"]
LPR_FEATURES: list[str] = LPR_NUMERIC + LPR_CATEGORICAL

LPR_LABELS: dict[str, str] = {
    "rate": "ставка",
    "term_months": "срок кредита",
    "amount_to_turnover": "сумма к обороту",
    "pti_after": "нагрузка после выдачи",
    "payment_share": "платёж к обороту",
    "n_prev_offers": "предложений уже видели",
    "prev_click_rate": "кликал раньше",
    "lpr_role": "роль ЛПР",
    "format_code": "формат подачи",
    "org_form": "организационно-правовая форма",
}

ROLE_KEYS = list(LPR_ROLES.keys())
FORMAT_KEYS = list(FORMATS.keys())
ORG_FORMS = ["ИП", "ООО", "Самозанятый"]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate_lpr_interactions(n: int = 12000, seed: int = 42) -> pd.DataFrame:
    """Одна строка = один показ предложения формату format_code роли lpr_role."""
    rng = np.random.default_rng(seed)

    # роли распределены неравномерно: ИП чаще сам себе владелец, в ООО роли разделены
    role = rng.choice(ROLE_KEYS, size=n, p=[0.46, 0.18, 0.20, 0.16])
    fmt = rng.choice(FORMAT_KEYS, size=n, p=[0.34, 0.24, 0.18, 0.24])
    org_form = rng.choice(ORG_FORMS, size=n, p=[0.5, 0.42, 0.08])

    # параметры предложения — из «жизни» МСП
    rate = np.clip(rng.normal(19.5, 3.2, n), 15.0, 30.0)
    term_months = rng.choice([6, 12, 18, 24, 36], size=n, p=[0.14, 0.3, 0.2, 0.16, 0.2])
    amount_to_turnover = np.clip(rng.lognormal(0.3, 0.6, n), 0.2, 6.0)
    pti_after = np.clip(rng.beta(2.2, 5.5, n) * 0.9, 0.02, 0.85)
    payment_share = np.clip(pti_after * rng.normal(0.8, 0.15, n), 0.01, 0.7)

    # история взаимодействия с каналом
    n_prev_offers = rng.poisson(2.2, n)
    prev_click_rate = rng.beta(1.6, 3.4, n)

    # ---------------- ground-truth склонность принять ----------------
    # база — матрица «роль × формат» из roles.py
    prior = np.array([ROLE_FORMAT_PRIOR[r][f] for r, f in zip(role, fmt)])
    u = prior.copy()

    # дорогое/нагруженное предложение финансист и главбух хотят видеть в расчёте,
    # а владелец от лишних таблиц только устанет
    heavy = (rate > 21) | (pti_after > 0.4)
    calc = fmt == "расчёт"
    u += np.where(calc & heavy, 0.55, 0.0)
    u += np.where(calc & (role == "владелец"), -0.45, 0.0)
    # крупная сумма — больше бумаг и согласований: формат с документами выигрывает
    u += np.where((fmt == "документы") & (amount_to_turnover > 2.5), 0.35, 0.0)
    # «польза» лучше заходит на коротких кредитов под оборотку
    u += np.where((fmt == "польза") & (term_months <= 12), 0.3, 0.0)
    # дорогая ставка бьёт по маркетинговому короткому формату («просто примите»)
    u += np.where((fmt == "короткий") & (rate > 23), -0.5, 0.0)
    # вовлечённость: кто кликает — тот и принимает; кто перегружен — слепнет
    u += 0.9 * (prev_click_rate - 0.4)
    u -= 0.12 * np.minimum(n_prev_offers, 8)
    # самозанятые/ИП решают быстрее, но короче — небольшая надбавка владельцу
    u += np.where((org_form != "ООО") & (role == "владелец"), 0.15, 0.0)

    p_accept = _sigmoid(u + rng.normal(0, 0.55, n) - 0.35)
    accepted = rng.binomial(1, p_accept)

    months = rng.integers(0, 12, n)  # для time-based split, как в скоринге

    return pd.DataFrame({
        "lpr_role": role,
        "format_code": fmt,
        "org_form": org_form,
        "rate": np.round(rate, 2),
        "term_months": term_months,
        "amount_to_turnover": np.round(amount_to_turnover, 3),
        "pti_after": np.round(pti_after, 4),
        "payment_share": np.round(payment_share, 4),
        "n_prev_offers": n_prev_offers,
        "prev_click_rate": np.round(prev_click_rate, 4),
        "p_true": np.round(p_accept, 5),
        "accepted": accepted,
        "month_idx": months,
    })

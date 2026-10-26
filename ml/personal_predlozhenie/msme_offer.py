"""Мост от реального профиля МСП (Kaggle MSME) к персональному предложению.

Датасет описывает КОМПАНИЮ (реестры, суды, налоги, капитал), но не содержит
кредитной заявки: нет оборотов по счёту, запрошенной суммы и срока. В банке эти
данные приходят из расчётного счёта и анкеты. Для прототипа мы честно подставляем
документированные прокси и позволяем переопределить их в запросе:

- оборот: годовой оборот ≈ 3 × оплаченный капитал (консервативная эвристика для МСП;
  значения в профиле — после log2-шкалы референса, поэтому сначала возвращаем
  их к реальному масштабу обратным преобразованием);
- возраст бизнеса / капитал / штат: обратное преобразование к шкале log2;
- просрочки: число налоговых просрочек за год → дни максимальной просрочки;
- «запрет у приставов»: свежее исполнительное производство (Executee_num_1year > 0)
  включает ТОТ ЖЕ жёсткий rule-gate, что и в синтетике — скоринг не перебивает его;
- заявка: сумма по умолчанию = 2 среднемесячных оборота (округлённая до 10 тыс.),
  срок 24 мес, цель — пополнение оборотных средств; всё переопределяется callers.

Риск-оценка берётся из реальной модели (real_scoring), дальше — обычный конвейер:
rules.decide → banner → predlozhenie_LPR.
"""
from __future__ import annotations

import math
import zlib

from . import rules
from .schemas import (Application, ApplicantFeatures, BanInfo, BanSource, OrgForm)

# Эвристика оборота: годовой оборот ≈ TURNOVER_TO_CAPITAL_YEARLY × оплаченный капитал.
TURNOVER_TO_CAPITAL_YEARLY = 3.0
# Прокси БКИ: базовый 680 + 20 за каждый год налогового кредит-грейда A, потолок 850.
BKII_BASE, BKII_PER_A_YEAR, BKII_MAX = 680, 20, 850


def _unscale(value) -> float:
    """Обратное преобразование log2-шкалы из kaggle_data.build_matrix."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(v) or v <= 0:
        return 0.0
    return 2.0 ** v


def _get(profile: dict, key: str, default: float = 0.0) -> float:
    v = profile.get(key, default)
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _org_form(profile: dict) -> OrgForm:
    t = str(profile.get("Enterprise_type", "")).lower()
    if "sole proprietorship of natural person" in t or "individual" in t:
        return OrgForm.IP
    return OrgForm.OOO  # в датасете подавляющее большинство — компании с ограниченной ответственностью


def profile_to_application(profile: dict, *,
                           requested_amount: float | None = None,
                           requested_term: int = 24,
                           loan_purpose: str = "пополнение оборотных средств",
                           lpr_role: str = "владелец",
                           apply_ban_gate: bool = True) -> Application:
    """Строка датасета (в scale-пространстве) → заявка для существующего кредитного конвейера."""
    paid_cap_real = _unscale(profile.get("Paid_in_capital (Ten thousand Yuan)"))
    est_days_real = _unscale(profile.get("Establishment_Duration (Days)"))
    years = round(est_days_real / 365.25, 2)
    insured_t1_real = _unscale(_get(profile, "t-1 Basic old-age insurance for urban employees", 1))
    employees = max(int(round(insured_t1_real)), int(_unscale(profile.get("MS_num", 1))))

    yearly_turnover = TURNOVER_TO_CAPITAL_YEARLY * paid_cap_real * 10_000  # 10 тыс. ¥ → ¥
    monthly_turnover = max(yearly_turnover / 12.0, 50_000.0)

    overdue_tax_1y = _get(profile, "Overdue_tax_num_1year")
    overdue_30d = min(int(30 + 15 * overdue_tax_1y), 120) if overdue_tax_1y > 0 else 0
    overdue_90d = int(overdue_tax_1y) if overdue_tax_1y >= 2 else 0

    a_years = _get(profile, "Ratepaying_Credit_Grade_A_num")
    bkii = min(BKII_BASE + BKII_PER_A_YEAR * int(a_years), BKII_MAX)

    ban = BanInfo()
    if apply_ban_gate and _get(profile, "Executee_num_1year") > 0:
        ban = BanInfo(source=BanSource.BAILIFF,
                      note="по данным датасета: исполнительное производство за последний год")

    amount = requested_amount
    if amount is None:
        raw = 2.0 * monthly_turnover
        amount = float(max(100_000.0, min(round(raw / 10_000) * 10_000, 15_000_000.0)))

    digest = zlib.crc32("|".join(str(profile.get(k, "")) for k in
                                 ("Province", "Sector",
                                  "Registered_capital (Ten thousand Yuan)")).encode("utf-8"))
    features = ApplicantFeatures(
        inn=f"MSME-{digest % 10**10:010d}",
        full_name="Компания из открытого датасета MSME",
        org_form=_org_form(profile),
        sector=str(profile.get("Sector", "прочее")),
        years_in_business=min(years, 40.0),
        employees=employees,
        annual_revenue=round(yearly_turnover, 0),
        avg_monthly_turnover=round(monthly_turnover, 0),
        expense_ratio=0.7,
        overdue_30d_max_days=overdue_30d,
        overdue_90d_count=overdue_90d,
        bkii_score=int(bkii),
        has_collateral=paid_cap_real >= 100,
        applicant_age=38,
        region=str(profile.get("Province", "unknown")),
    )
    return Application(features=features, ban=ban,
                       requested_amount=float(amount),
                       requested_term=int(requested_term),
                       loan_purpose=loan_purpose,
                       lpr_role=lpr_role)


def product_hint(profile: dict, decision: rules.DecisionResponse | None = None) -> str:
    """Подсказка продукта по профилю реестров (используется текстами баннера)."""
    if _get(profile, "Overdue_tax_num_1year") > 0 or _get(profile, "Legal_proceedings_num_1year") > 2:
        return "снижение нагрузки по долгам"
    if _get(profile, "Patent_info_num_1year") + _get(profile, "Software_copyright_info_num_1year") > 0:
        return "оборудование/развитие"
    return "пополнение оборотных средств"

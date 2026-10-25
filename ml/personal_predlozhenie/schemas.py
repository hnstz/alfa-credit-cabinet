"""Контракты API (pydantic v2 DTO). Это то, что вызывает фуллстэк-оркестратор.

Заморозка контракта = День 4–5 (см. roles.md). Меняется только через эту спеку +
автогенерированный OpenAPI (`GET /openapi.json`). Ответы модуля ЛПР — в
predlozhenie_LPR/schemas.py.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ------------------------------ Перечисления ------------------------------

class OrgForm(str, Enum):
    OOO = "ООО"
    IP = "ИП"
    SELFEMPLOYED = "Самозанятый"


class BanSource(str, Enum):
    NONE = "none"                # запретов нет
    SELF = "self"                 # самозапрет (добровольно, через Госуслуги)
    BANK = "bank"                 # запрет, установленный банком
    BAILIFF = "bailiff"           # ограничение у приставов / арест


class RiskGrade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class Outcome(str, Enum):
    APPROVE = "approve"
    COUNTER = "counter"          # встречное предложение
    REJECT = "reject"


class BannerKind(str, Enum):
    OFFER = "offer"              # персональное кредитное предложение
    INFO = "info"                # информ-карточка (напр. про запрет) — НЕ оффер
    EDUCATIONAL = "educational"  # «что улучшить» — мягкий отказ без оффера


# ------------------------------ Вход: профиль ------------------------------

class ApplicantFeatures(BaseModel):
    """Финансовые/поведенческие признаки заёмщика МСП. Признаки, а не «фирмография»."""
    inn: str = Field(..., description="ИНН клиента")
    full_name: str = Field("Индивидуальный предприниматель", description="Имя клиента для баннера")

    org_form: OrgForm = OrgForm.IP
    sector: str = Field("Розничная торговля", description="ОКВЭД-отрасль (кат.)")
    years_in_business: float = Field(..., ge=0, description="возраст бизнеса, лет")
    employees: int = Field(3, ge=0)

    annual_revenue: float = Field(..., ge=0, description="выручка, ₽/год")
    avg_monthly_turnover: float = Field(..., ge=0, description="среднемесячный оборот (динамика ден. потоков), ₽")
    net_profit_margin: float = Field(0.08, ge=-1, le=1, description="маржинальность чистой прибыли")
    expense_ratio: float = Field(0.7, ge=0, le=1, description="доля расходов в обороте")
    cash_gap_flag: bool = Field(False, description="признак кассового разрыва")
    # Нужда из платежного поведения, а не из слов клиента.
    tax_debt: float = Field(0.0, ge=0, description="задолженность по налогам на дату заявки, ₽")
    turnover_trend_3m_pct: float = Field(0.0, description="изменение оборота за 3 месяца, %")

    # Кредитная история (мок БКИ)
    active_loans: int = Field(0, ge=0, description="активные кредитные обязательства")
    existing_monthly_debt: float = Field(0.0, ge=0, description="текущий ежемесячный платёж по долгам, ₽")
    bkii_score: int = Field(700, ge=300, le=999, description="оценка БКИ")
    overdue_30d_max_days: int = Field(0, ge=0, description="макс. просрочка 30+ за 24 мес")
    overdue_90d_count: int = Field(0, ge=0, description="число просрочек 90+ за 24 мес")

    # Параметры заявки/анкеты
    applicant_age: int = Field(38, ge=14, le=100)
    has_collateral: bool = Field(False, description="есть залог")
    region: str = Field("Москва")


class BanInfo(BaseModel):
    """Состояние запрета на кредиты — жёсткий rule-gate до скоринга."""
    source: BanSource = BanSource.NONE
    since: Optional[str] = Field(None, description="дата установки запрета (ISO)")
    note: str = Field("", description="комментарий источника запрета")

    @property
    def active(self) -> bool:
        return self.source != BanSource.NONE


class Application(BaseModel):
    """Заявка на скоринг: профиль + параметры желаемого кредита + запреты."""
    features: ApplicantFeatures
    ban: BanInfo = Field(default_factory=BanInfo)
    requested_amount: float = Field(..., gt=0, description="запрошенная сумма, ₽")
    requested_term: int = Field(..., gt=0, le=120, description="запрошенный срок, мес")
    loan_purpose: str = Field("пополнение оборотных средств", description="цель финансирования")
    preferred_product: Optional[str] = Field(None, description="код продукта, если клиент уже выбрал")
    # для модуля predlozhenie_LPR: кто в компании принимает решение по кредиту;
    # строкой, чтобы фронт мог прислать что угодно и не ловить 422
    lpr_role: str = Field("владелец", description="роль ЛПР: владелец | финансовый директор | главбух | управляющий")


# ------------------------------ Ответы ------------------------------

class FactorContribution(BaseModel):
    feature: str
    label: str
    value: float
    shap: float = Field(..., description="вклад в log-odds дефолта (+ увеличивает риск)")
    direction: str = Field(..., description="risk_up | risk_down")
    text: str = Field(..., description="челочитаемая формулировка для консоли банка")


class ScoreResponse(BaseModel):
    inn: str
    pd: float = Field(..., ge=0, le=1, description="вероятность дефолта (калиброванная)")
    risk_grade: RiskGrade
    model_version: str
    is_banned: bool = Field(..., description="истина, если сработал жёсткий запрет (модель не консультируется)")
    top_factors: list[FactorContribution] = Field(default_factory=list, description="объяснимость (SHAP top)")


class CreditTerms(BaseModel):
    product_code: str
    product_title: str
    amount: float
    term_months: int
    rate: float = Field(..., description="годовая ставка, %")
    monthly_payment: float
    pti: float = Field(..., description="долговая нагрузка после выдачи (платёж/доход)")


class DecisionResponse(BaseModel):
    inn: str
    outcome: Outcome
    risk_grade: RiskGrade
    pd: float
    is_banned: bool
    terms: Optional[CreditTerms] = Field(None, description="условия (для approve/counter)")
    reasons: list[str] = Field(default_factory=list, description="причины решения (для консоли/журнала)")
    reject_codes: list[str] = Field(default_factory=list, description="машинные коды отказов")
    top_factors: list[FactorContribution] = Field(default_factory=list)


class BannerResponse(BaseModel):
    inn: str
    kind: BannerKind
    headline: str
    body: str
    cta: str
    badge: str = ""
    terms: Optional[CreditTerms] = None
    reason_chips: list[str] = Field(default_factory=list)
    generated_by: str = Field("template", description="template | llm")


class MetricsResponse(BaseModel):
    model_version: str
    trained_at: str
    n_train: int
    n_test: int
    auc: float
    ks: float
    psi: Optional[float] = None
    grade_distribution: dict[str, int]
    default_rate_test: float
    pd_mean_test: float
    # метрики модели склонности ЛПР — как есть из lpr_meta.json (или None, если не обучена)
    lpr: Optional[dict] = None
    # метрики скоринга на реальных данных Kaggle + сравнение с ResMLP-референсом
    # (или None, если msme-модель не обучена)
    msme: Optional[dict] = None

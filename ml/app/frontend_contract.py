"""Совместимость с фронтендом alfa-credit-cabinet: контракт POST /predict.

Фронтенд присылает признаки клиента и ждёт только код баннера и уверенность.
Тексты, суммы и кнопки он берёт из своего каталога, поэтому здесь не отдаём
ни HTML, ни заголовки. Контракт описан в docs/ML_BANNER.md их репозитория.

Цепочка: BannerFeatures -> Application -> скоринг и правила -> код баннера.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from personal_predlozhenie.schemas import (ApplicantFeatures, Application,
                                           DecisionResponse, OrgForm, Outcome)

# Коды баннеров их каталога. Порядок проверок важен: сначала повод из заявки.
OFFER_READY = ("APPROVED", "COUNTER_OFFER")
CLOSED = {"REJECTED", "DISBURSED", "OFFER_DECLINED"}


class CompanyFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    legal_form: str = Field("OOO", description="OOO или IP")
    okved: str = ""
    region: str = "Москва"
    age_months: float = Field(0, ge=0)
    employees: int = Field(0, ge=0)
    annual_revenue: float = Field(0, ge=0)


class TurnoverFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    months_of_history: int = Field(0, ge=0)
    avg_inflow_3m: float = Field(0, ge=0)
    trend_3m_pct: float = 0
    gap_months_12m: int = Field(0, ge=0)


class BkiFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    has_history: bool = False
    rating: Optional[int] = None
    active_loans: int = Field(0, ge=0)
    monthly_payments: float = Field(0, ge=0)
    max_overdue_days: int = Field(0, ge=0)
    overdues_12m: int = Field(0, ge=0)
    requests_30d: int = Field(0, ge=0)


class ApplicationsFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    has_draft: bool = False
    draft_step: Optional[int] = None
    recent_statuses: list[str] = Field(default_factory=list)
    has_active_loan: bool = False
    days_since_last_application: Optional[int] = None


class BannerFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company: CompanyFeatures = Field(default_factory=CompanyFeatures)
    turnover: TurnoverFeatures = Field(default_factory=TurnoverFeatures)
    bki: BkiFeatures = Field(default_factory=BkiFeatures)
    tax_debt: float = Field(0, ge=0)
    industry_risk: str = "LOW"
    debt_load: float = Field(0, ge=0)
    applications: ApplicationsFeatures = Field(default_factory=ApplicationsFeatures)


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    client_id: str = ""
    features: BannerFeatures = Field(default_factory=BannerFeatures)


class PredictResponse(BaseModel):
    """Ответ по их контракту. null вместо объекта означает «ничего не показывать»."""

    banner_code: str
    score: float = Field(..., ge=0, le=1)
    model_version: str
    amount: Optional[float] = None
    term_months: Optional[int] = None
    reasons: list[str] = Field(default_factory=list)


# ------------------------------ маппинг входа ------------------------------

# ОКВЭД, первые две цифры, к отраслям из обучающей выборки.
OKVED_SECTOR: dict[str, str] = {
    "01": "Сельское хозяйство", "02": "Сельское хозяйство", "03": "Сельское хозяйство",
    "10": "Производство", "20": "Производство", "25": "Производство", "33": "Производство",
    "41": "Строительство", "42": "Строительство", "43": "Строительство",
    "45": "Розничная торговля", "46": "Розничная торговля", "47": "Розничная торговля",
    "49": "Грузоперевозки", "52": "Грузоперевозки", "53": "Грузоперевозки",
    "55": "Общепит", "56": "Общепит",
    "62": "IT и услуги", "63": "IT и услуги",
    "86": "Медицина", "87": "Медицина", "88": "Медицина",
    "96": "Красота и сервис",
}


def sector_for(okved: str) -> str:
    key = (okved or "").strip()[:2]
    return OKVED_SECTOR.get(key, "Розничная торговля")


def to_application(req: PredictRequest) -> Application:
    """Признаки баннера в заявку нашего скоринга. Недостающее берётся по умолчанию."""
    f = req.features
    years = round(f.company.age_months / 12.0, 2)
    turnover = float(f.turnover.avg_inflow_3m or 0)
    # Запрошенной суммы фронт не присылает, считаем её от оборота.
    amount = min(max(turnover * 3.0, 100_000.0), 10_000_000.0)
    rating = f.bki.rating if f.bki.rating is not None else 700
    return Application(
        features=ApplicantFeatures(
            inn=req.client_id or "0000000000",
            org_form=OrgForm.OOO if f.company.legal_form.upper() == "OOO" else OrgForm.IP,
            sector=sector_for(f.company.okved),
            years_in_business=max(years, 0.0),
            employees=f.company.employees,
            annual_revenue=f.company.annual_revenue,
            avg_monthly_turnover=turnover,
            cash_gap_flag=f.turnover.gap_months_12m >= 2,
            tax_debt=float(f.tax_debt or 0),
            turnover_trend_3m_pct=float(f.turnover.trend_3m_pct or 0),
            active_loans=f.bki.active_loans,
            existing_monthly_debt=f.bki.monthly_payments,
            bkii_score=int(min(max(rating, 300), 999)),
            overdue_30d_max_days=f.bki.max_overdue_days,
            overdue_90d_count=f.bki.overdues_12m,
            region=f.company.region or "Москва",
        ),
        requested_amount=amount,
        requested_term=24,
        loan_purpose="пополнение оборотных средств",
    )


# ------------------------------ выбор кода ------------------------------

def pick_code(req: PredictRequest, decision: DecisionResponse) -> Optional[str]:
    """Код баннера по приоритетам их каталога. None означает «не показывать»."""
    f = req.features
    statuses = [s.upper() for s in f.applications.recent_statuses]

    if "SIGNING" in statuses:
        return "SIGN_DOCS"
    if any(s in OFFER_READY for s in statuses):
        return "ACCEPT_OFFER"
    if f.applications.has_draft:
        return "CONTINUE_DRAFT"
    if any(s not in CLOSED for s in statuses):
        return None  # заявка в работе, предложениями не отвлекаем

    if f.tax_debt > 0 or f.bki.max_overdue_days > 30:
        return "CLOSE_TAX_DEBT"
    if f.debt_load >= 0.35:
        return "REFINANCE"
    if f.company.age_months < 12 or f.turnover.months_of_history < 6:
        return "STARTER_LOAN"
    if f.turnover.gap_months_12m >= 2:
        return "SEASONAL_BUFFER"
    if decision.outcome == Outcome.REJECT:
        return None  # модель против оффера, лучше промолчать
    if f.turnover.trend_3m_pct >= 5 and f.company.annual_revenue >= 30_000_000:
        return "CREDIT_LINE_LIMIT"
    if f.bki.has_history and (f.bki.rating or 0) >= 700:
        return "GROWTH_INVEST"
    return "WORKING_CAPITAL"


def _money(value: float) -> str:
    return f"{int(round(value)):,}".replace(",", " ") + " \u20bd"


def _plain(value: float) -> str:
    return f"{value:g}".replace(".", ",")


def _percent_word(value: float) -> str:
    """Согласование слова процент с числом."""
    if abs(value - round(value)) > 1e-9:
        return "процента"
    n = abs(int(round(value))) % 100
    if 11 <= n <= 14 or n % 10 == 0 or n % 10 >= 5:
        return "процентов"
    if n % 10 == 1:
        return "процент"
    return "процента"


# Верхние границы суммы по коду баннера. Каталог фронтенда подставляет свои,
# если мы вернём null, поэтому ограничиваем только там, где уверены в цифре.
def _amount_cap(code: str, req: PredictRequest) -> float:
    inflow = max(req.features.turnover.avg_inflow_3m, 0.0)
    caps = {
        "STARTER_LOAN": 300_000.0,
        "SEASONAL_BUFFER": 1_000_000.0,
        "WORKING_CAPITAL": 3.0 * inflow,
        "CREDIT_LINE_LIMIT": 3.0 * inflow,
        "GROWTH_INVEST": 5.0 * inflow,
        "REFINANCE": 12.0 * req.features.bki.monthly_payments,
    }
    return caps.get(code, 0.0)


def _amount_for(code: str, req: PredictRequest,
                decision: DecisionResponse) -> tuple[Optional[float], Optional[int]]:
    """Сумма и срок для баннера. None означает «взять из каталога фронтенда»."""
    cap = _amount_cap(code, req)
    if cap <= 0:
        return None, None
    base = decision.terms.amount if decision.terms is not None else cap
    amount = float(int(min(base, cap) // 100_000 * 100_000))
    if amount < 100_000:
        return None, None
    term = int(decision.terms.term_months) if decision.terms is not None else 24
    return amount, term


def build_reasons(code: str, req: PredictRequest,
                  decision: DecisionResponse) -> list[str]:
    """Короткие причины для блока «Почему я это вижу», без служебных терминов."""
    f = req.features
    if code == "SIGN_DOCS":
        return ["Документы по вашей заявке ждут подписи"]
    if code == "ACCEPT_OFFER":
        return ["По вашей заявке есть решение банка, оно действует ограниченное время"]
    if code == "CONTINUE_DRAFT":
        return ["Вы начали заполнять заявку, но не отправили её"]
    if code == "CLOSE_TAX_DEBT":
        return ["Есть задолженность перед бюджетом или просрочка в кредитной истории",
                "Пока это не закрыто, банк скорее всего откажет в новом кредите"]
    if code == "REFINANCE":
        return [f"Платежи по кредитам занимают {int(f.debt_load * 100)} {_percent_word(f.debt_load * 100)} поступлений",
                "Один кредит с длинным сроком снизит ежемесячную нагрузку"]
    if code == "STARTER_LOAN":
        return ["Бизнесу меньше года, кредитной истории пока нет",
                "Небольшой кредит поможет её начать"]
    if code == "SEASONAL_BUFFER":
        return [f"В {f.turnover.gap_months_12m} из последних 12 месяцев расходы были больше поступлений",
                "Кредитная линия закрывает такие разрывы"]
    if code == "CREDIT_LINE_LIMIT":
        return [f"Поступления за 3 месяца выросли на {_plain(f.turnover.trend_3m_pct)} {_percent_word(f.turnover.trend_3m_pct)}",
                "Стабильный рост, лимит можно рассчитать заранее"]
    if code == "GROWTH_INVEST":
        return ["Кредитная история без просрочек и стабильные обороты",
                "Подойдёт для расширения бизнеса"]
    reasons = ["Подобрали вариант под ваш профиль"]
    return reasons


def build(req: PredictRequest, decision: DecisionResponse,
          model_version: str) -> Optional[PredictResponse]:
    """Готовый ответ для фронтенда или None, если баннер показывать не нужно."""
    code = pick_code(req, decision)
    if code is None:
        return None
    amount, term = _amount_for(code, req, decision)
    reasons = build_reasons(code, req, decision)
    if amount is not None and decision.terms is not None:
        reasons.append(f"Предварительный лимит {_money(amount)} под "
                       f"{_plain(decision.terms.rate)} {_percent_word(decision.terms.rate)}")
    return PredictResponse(
        banner_code=code,
        score=round(min(max(1.0 - decision.pd, 0.05), 0.99), 3),
        model_version=model_version,
        amount=amount,
        term_months=term,
        reasons=reasons,
    )

"""DTO модуля predlozhenie_LPR — что получает оркестратор на /lpr.

Вход тот же, что у /score и /banner (Application из personal_predlozhenie.schemas,
поле lpr_role), ответ — карточка предложения под конкретную роль ЛПР.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from personal_predlozhenie.schemas import CreditTerms


class FormatScore(BaseModel):
    format_code: str = Field(..., description="короткий | расчёт | документы | польза")
    format_title: str
    p_accept: float = Field(..., ge=0, le=1,
                            description="модель склонности: вероятность, что эта роль примет предложение в этом формате")


class LprOfferResponse(BaseModel):
    """Персональное предложение под роль ЛПР: та же суть, другие акценты/объём/канал."""
    inn: str
    role_key: str = Field(..., description="каноническая роль: владелец | финансовый директор | главбух | управляющий")
    role_title: str
    decision_lens: str = Field(..., description="чем эта роль меряет предложение (для консоли/обоснования)")
    format_code: str
    format_title: str
    headline: str
    body: str
    emphasis: list[str] = Field(default_factory=list, description="что подсвечиваем в карточке, по порядку")
    terms: CreditTerms | None = None
    channel: str
    best_time: str
    p_accept: float = Field(..., ge=0, le=1, description="склонность принять выбранный формат")
    alternatives: list[FormatScore] = Field(default_factory=list,
                                            description="все форматы с оценкой — для A/B и для объяснимости")
    why: list[str] = Field(default_factory=list, description="почему подаём именно так (человеческим языком)")
    model_version: str = Field("lpr-propensity-1.0")
    generated_by: str = Field("model", description="model | prior: prior = модель недоступна, формат выбран по L1-матрице")

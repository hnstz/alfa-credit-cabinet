"""Тонкий HTTP-слой ML-сервиса: контракт для фуллстэк-оркестатора.

Весь смысл — в двух модулях, а здесь только маршруты и склейка:
- personal_predlozhenie — что предложить бизнесу (скоринг, правила, базовый баннер);
- predlozhenie_LPR      — как подать это предложение конкретному ЛПР (модель склонности).

Отдельная линия /msme — то же самое, но риск-оценка берётся из модели, обученной
на РЕАЛЬНЫХ открытых данных Kaggle (MSME Credit Data by 30S-CR), а не на синтетике.

env: ML_ARTIFACTS_DIR, ML_KEY_RATE, ML_LLM_ENABLED, LLM_BASE_URL, LLM_MODEL, ML_SEED.
Запуск: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (из каталога ml/).
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.frontend_contract import PredictRequest, PredictResponse, build as build_frontend_banner
from app.frontend_contract import to_application as frontend_to_application

from personal_predlozhenie import banner as personal_banner
from personal_predlozhenie import banner_html, config, msme_offer, offers, real_scoring, rules, scoring
from predlozhenie_LPR import lpr_model, lpr_offer
from personal_predlozhenie.schemas import (Application, BannerResponse,
                                           DecisionResponse, MetricsResponse,
                                           RiskGrade, ScoreResponse)
from predlozhenie_LPR.schemas import LprOfferResponse

app = FastAPI(
    title="Alfa-Hack ML sidecar — персональные предложения и подача под ЛПР",
    version="1.2.0",
    description="L2 скоринг (CatBoost: синтетика + реальные данные Kaggle MSME) "
                "+ правила-ограничения (запрет на кредиты, PTI) + персональные баннеры "
                "+ модель склонности для роли ЛПР. OpenAPI автогенерится на /openapi.json.",
)

# Фронтенд alfa-credit-cabinet ходит с другого порта, поэтому CORS открыт.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_settings = config.get_settings()
_artifacts = _settings.resolved_artifacts_dir()
_service = scoring.ScoringService(_artifacts)
_real_service = real_scoring.RealScoringService(_artifacts)
_lpr_service = lpr_model.LprService(_artifacts)


# ------------------------------- helpers -------------------------------

def features_to_row(app_req: Application) -> dict:
    """ApplicantFeatures → строка признаков в порядке MODEL_FEATURES (с производными)."""
    f = app_req.features
    turnover = float(f.avg_monthly_turnover or 0)
    income = max(turnover * (1.0 - f.expense_ratio), 20_000.0)
    row = {
        "years_in_business": f.years_in_business,
        "employees": f.employees,
        "annual_revenue": f.annual_revenue,
        "avg_monthly_turnover": turnover,
        "net_profit_margin": f.net_profit_margin,
        "expense_ratio": f.expense_ratio,
        "active_loans": f.active_loans,
        "existing_monthly_debt": f.existing_monthly_debt,
        "bkii_score": f.bkii_score,
        "overdue_30d_max_days": f.overdue_30d_max_days,
        "overdue_90d_count": f.overdue_90d_count,
        "applicant_age": f.applicant_age,
        "cash_gap_flag": int(f.cash_gap_flag),
        "has_collateral": int(f.has_collateral),
        "pti_current": round(f.existing_monthly_debt / income, 4),
        "requested_amount": float(app_req.requested_amount),
        "requested_term": int(app_req.requested_term),
        "loan_to_turnover": round(app_req.requested_amount / max(turnover, 1), 3),
        "org_form": f.org_form.value,
        "sector": f.sector,
        "loan_purpose": app_req.loan_purpose,
    }
    return row


def _run_score(app_req: Application) -> tuple[ScoreResponse, "rules.ScoreInput | None"]:
    """Скоринг + флаг запрета. Возвращает ScoreResponse и (score-input или None при запрете)."""
    row = features_to_row(app_req)
    ban_active = app_req.ban.active
    if _service.available:
        res = _service.score(row)
        pd_val, grade, factors = res["pd"], res["risk_grade"], res["top_factors"]
    else:
        grade, pd_val = rules.fallback_grade(row)   # fallback L1, если модель не обучена
        factors = []
    score_resp = ScoreResponse(
        inn=app_req.features.inn, pd=pd_val, risk_grade=RiskGrade(grade),
        model_version=res_model_version(), is_banned=ban_active,
        top_factors=factors)
    # Модель показываем всегда (для консоли/объяснимости), но при ban_active правила
    # перебивают скор: decide() короткозамыкает на жёстком gate и не использует грейд для выдачи.
    score_input = rules.ScoreInput(
        pd=pd_val, risk_grade=grade, top_factors=_to_factor_models(factors))
    return score_resp, score_input


def res_model_version() -> str:
    return scoring.MODEL_VERSION if _service.available else "l1-rules-fallback"


def _to_factor_models(factors: list[dict]):
    from personal_predlozhenie.schemas import FactorContribution
    return [FactorContribution(**f) for f in factors]


def _run_lpr(app_req: Application, dec: DecisionResponse,
             ban: BannerResponse, score_input) -> LprOfferResponse:
    return lpr_offer.build(app_req, dec, ban, score_input, _lpr_service)


# ------------------------------- endpoints -------------------------------

@app.get("/", include_in_schema=False)
def root():
    """Для демонстрации: корень сразу открывает витрину баннеров."""
    return RedirectResponse("/preview/banner")


@app.get("/health", tags=["ops"])
def health():
    return {"status": "ok", "model_available": _service.available,
            "model_version": res_model_version(), "key_rate": _settings.key_rate,
            "lpr_model_available": _lpr_service.available,
            "msme_model_available": _real_service.available}


@app.get("/metrics", response_model=MetricsResponse, tags=["ops"])
def metrics():
    if not _service.available:
        raise HTTPException(503, "Модель не обучена. Запустите: python train.py")
    m = _service.metrics
    return MetricsResponse(
        model_version=m.get("model_version", scoring.MODEL_VERSION),
        trained_at=m.get("trained_at", ""),
        n_train=m.get("n_train", 0), n_test=m.get("n_test", 0),
        auc=m.get("auc", 0.0), ks=m.get("ks", 0.0), psi=m.get("psi"),
        grade_distribution=m.get("grade_distribution", {}),
        default_rate_test=m.get("default_rate_test", 0.0),
        pd_mean_test=m.get("pd_mean_test", 0.0),
        lpr=_lpr_service.metrics if _lpr_service.available else None,
        msme=_msme_metrics())


def _msme_metrics() -> Optional[dict]:
    """Метрики реальной модели + воспроизведённого референса (ResMLP), если обучены."""
    import json
    import os

    from personal_predlozhenie import resmlp_reference
    out = {}
    if _real_service.available:
        out["catboost_prod"] = _real_service.metrics
    resmlp_path = os.path.join(_artifacts, resmlp_reference.METRICS_FILE)
    if os.path.exists(resmlp_path):
        with open(resmlp_path, encoding="utf-8") as f:
            out["resmlp_reference"] = json.load(f)
    return out or None


@app.post("/score", response_model=ScoreResponse, tags=["ml"])
def score(application: Application):
    resp, _ = _run_score(application)
    return resp


@app.post("/decision", response_model=DecisionResponse, tags=["ml"])
def decision(application: Application):
    score_resp, score_input = _run_score(application)
    row = features_to_row(application)
    return rules.decide(application, score_input, row)


@app.post("/banner", response_model=BannerResponse, tags=["ml"])
def make_banner(application: Application):
    score_resp, score_input = _run_score(application)
    row = features_to_row(application)
    dec = rules.decide(application, score_input, row)
    return personal_banner.build(application, dec, score_input)


@app.post("/banner/html", response_class=HTMLResponse, tags=["ml"],
          summary="Баннер в вёрстке Альфа-Бизнес Онлайн: три карточки")
def make_banner_html(application: Application):
    """Готовый HTML: один персональный баннер под роль ЛПР и два классических."""
    score_resp, score_input = _run_score(application)
    row = features_to_row(application)
    dec = rules.decide(application, score_input, row)
    ban = personal_banner.build(application, dec, score_input)
    lpr = _run_lpr(application, dec, ban, score_input)
    task = banner_html.task_phrase(application.loan_purpose,
                                   application.features.cash_gap_flag)
    offer = offers.personal_offer(application, score_resp, dec, application.lpr_role)
    return HTMLResponse(banner_html.render_strip(ban, lpr, task=task, offer=offer))


@app.get("/preview/banner", response_class=HTMLResponse, tags=["ml"],
         summary="Страница предпросмотра баннеров на демо-профиле")
def preview_banner(scenario: int = 0, role: str = "владелец"):
    """Демо-витрина без запроса: берёт профиль из artifacts/demo_profiles.json.

    scenario — номер сценария из файла, role — роль ЛПР для карточки.
    """
    import json
    import os

    path = os.path.join(_artifacts, "demo_profiles.json")
    if not os.path.exists(path):
        raise HTTPException(404, "Нет artifacts/demo_profiles.json. Запустите python train.py")
    with open(path, encoding="utf-8") as f:
        demos = json.load(f)
    if not 0 <= scenario < len(demos):
        raise HTTPException(400, f"Сценарий от 0 до {len(demos) - 1}")
    demo = demos[scenario]
    application = Application(**demo["application"]).model_copy(update={"lpr_role": role})
    score_resp, score_input = _run_score(application)
    row = features_to_row(application)
    dec = rules.decide(application, score_input, row)
    ban = personal_banner.build(application, dec, score_input)
    lpr = _run_lpr(application, dec, ban, score_input)
    task = banner_html.task_phrase(application.loan_purpose,
                                   application.features.cash_gap_flag)
    offer = offers.personal_offer(application, score_resp, dec, application.lpr_role)
    return HTMLResponse(banner_html.render_page(ban, lpr, dec, score_resp,
                                                caption=demo["scenario"], task=task,
                                                offer=offer))


@app.post("/lpr", response_model=LprOfferResponse, tags=["ml"],
          summary="Предложение под роль ЛПР: формат, акценты, канал")
def make_lpr_offer(application: Application):
    """Для той же заявки и того же решения — карточка, переупакованная под ЛПР
    (application.lpr_role: владелец / финансовый директор / главбух / управляющий)."""
    score_resp, score_input = _run_score(application)
    row = features_to_row(application)
    dec = rules.decide(application, score_input, row)
    ban = personal_banner.build(application, dec, score_input)
    return _run_lpr(application, dec, ban, score_input)


class PipelineResponse(BaseModel):
    """Сквозной ответ: скоринг → решение → баннер → карточка под роль ЛПР."""
    score: ScoreResponse
    decision: DecisionResponse
    banner: BannerResponse
    lpr: Optional[LprOfferResponse] = None


@app.post("/pipeline", response_model=PipelineResponse, tags=["ml"])
def pipeline(application: Application):
    """Сквозной демо-прогон: скоринг → решение по правилам → баннер → подача под ЛПР."""
    score_resp, score_input = _run_score(application)
    row = features_to_row(application)
    dec = rules.decide(application, score_input, row)
    ban = personal_banner.build(application, dec, score_input)
    return PipelineResponse(score=score_resp, decision=dec, banner=ban,
                            lpr=_run_lpr(application, dec, ban, score_input))


@app.post("/predict", response_model=PredictResponse, tags=["ml"],
          summary="Баннер для фронтенда alfa-credit-cabinet: код и уверенность",
          responses={204: {"description": "Баннер показывать не нужно"}})
def predict_banner(req: PredictRequest):
    """Контракт из docs/ML_BANNER.md репозитория alfa-credit-cabinet.

    Фронтенд присылает признаки клиента, получает код баннера, уверенность,
    сумму, срок и причины. Тексты и кнопки он берёт из своего каталога.
    """
    application = frontend_to_application(req)
    score_resp, score_input = _run_score(application)
    dec = rules.decide(application, score_input, features_to_row(application))
    result = build_frontend_banner(req, dec, score_resp.model_version)
    if result is None:
        return Response(status_code=204)
    return result


# ------------------------- реальные данные Kaggle MSME -------------------------

class MsmeScoreRequest(BaseModel):
    """Профиль компании из датасета (колонки после kaggle_data.build_matrix)."""
    profile: dict


class MsmeOfferRequest(MsmeScoreRequest):
    """Плюс параметры желаемого кредита — в датасете заявки нет, только компания."""
    requested_amount: Optional[float] = None
    requested_term: int = 24
    loan_purpose: str = "пополнение оборотных средств"
    lpr_role: str = "владелец"


def _run_real_score(profile: dict) -> tuple[dict, "rules.ScoreInput"]:
    if not _real_service.available:
        raise HTTPException(503, "Реальный скоринг не обучен: положите ml/data/msme_kaggle.xlsx "
                                 "и запустите python train.py")
    res = _real_service.score(profile)
    score_input = rules.ScoreInput(pd=res["pd"], risk_grade=res["risk_grade"],
                                   top_factors=_to_factor_models(res["top_factors"]))
    return res, score_input


@app.post("/msme/score", tags=["ml"],
          summary="Оценка риска компании на модели, обученной на реальных данных Kaggle")
def msme_score(req: MsmeScoreRequest):
    res, _ = _run_real_score(req.profile)
    return res


@app.post("/msme/offer", response_model=PipelineResponse, tags=["ml"],
          summary="Полный конвейер на реальном профиле: риск → решение → баннер → ЛПР")
def msme_offer_pipeline(req: MsmeOfferRequest):
    """Реестровый профиль компании → риск-грейд (реальная модель) → правила →
    баннер → карточка под роль ЛПР. Обороты/заявка — документированные прокси
    (см. personal_predlozhenie/msme_offer.py), переопределяются в запросе."""
    res, score_input = _run_real_score(req.profile)
    app_req = msme_offer.profile_to_application(
        req.profile, requested_amount=req.requested_amount,
        requested_term=req.requested_term, loan_purpose=req.loan_purpose,
        lpr_role=req.lpr_role)
    # скоринг уже посчитан реальной моделью; при активном запрете rules.decide
    # короткозамкнёт на жёсткий gate — модель решения не перебивает
    row = features_to_row(app_req)
    dec = rules.decide(app_req, score_input, row)
    ban = personal_banner.build(app_req, dec, score_input)
    score_resp = ScoreResponse(
        inn=app_req.features.inn, pd=res["pd"], risk_grade=RiskGrade(res["risk_grade"]),
        model_version=res["model_version"], is_banned=app_req.ban.active,
        top_factors=res["top_factors"])
    return PipelineResponse(score=score_resp, decision=dec, banner=ban,
                            lpr=_run_lpr(app_req, dec, ban, score_input))

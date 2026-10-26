"""L2 скоринг-модель: CatBoost (open source) → PD → риск-грейд + объяснимость (SHAP).

Методика (см. roles.md / память проекта):
- time-based split по month_idx (без утечек);
- калибровка вероятностей — встроенный Isotonic (CatBoost.calibrate_model);
- метрики AUC/KS/PSI в артефакт;
- объяснимость — точные SHAP-вклады CatBoost (без пакета shap), топ-признаков на заявку.
Модель даёт ОЦЕНКУ РИСКА; итоговое решение принимает rules-движок, не модель.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import roc_auc_score

from . import config
from .synthetic import CAT_FEATURES, FEATURE_LABELS, MODEL_FEATURES, NUMERIC_FEATURES

MODEL_FILE = "scoring_catboost.cbm"
META_FILE = "scoring_meta.json"
MODEL_VERSION = "l2-catboost-1.0"


# --------------------------------- метрики ---------------------------------

def ks_score(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """Kolmogorov–Smirnov = max|TPR-FPR| — способность различать заёмщиков."""
    order = np.argsort(-y_score)
    y = np.asarray(y_true)[order]
    pos, neg = float((y == 1).sum()), float((y == 0).sum())
    tpr = np.cumsum(y == 1) / max(pos, 1)
    fpr = np.cumsum(y == 0) / max(neg, 1)
    return float(np.max(np.abs(tpr - fpr)))


def psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index распределения PD (стабильность)."""
    qs = np.quantile(expected, np.linspace(0, 1, bins + 1))
    qs[0], qs[-1] = -np.inf, np.inf
    e_counts = np.histogram(expected, qs)[0]
    a_counts = np.histogram(actual, qs)[0]
    e_pct = np.clip(e_counts / e_counts.sum(), 1e-4, None)
    a_pct = np.clip(a_counts / a_counts.sum(), 1e-4, None)
    return float(np.sum((a_pct - e_pct) * np.log(a_pct / e_pct)))


def grade_from_pd(pd_val: float) -> str:
    """PD → риск-грейд A/B/C/D по порогам из config."""
    for grade, bound in config.RISK_GRADE_BOUNDS:
        if pd_val < bound:
            return grade
    return "D"


# --------------------------------- обучение ---------------------------------

@dataclass
class TrainResult:
    model: CatBoostClassifier
    metrics: dict
    calibrator: IsotonicRegression | None = None


def train(df: pd.DataFrame, artifacts_dir: str, *, iters: int = 600,
          seed: int = 42) -> TrainResult:
    """Обучить и откалибровать скоринг-модель, сохранить артефакты, вернуть метрики."""
    df = df.sort_values("month_idx").reset_index(drop=True)
    cut = int(df["month_idx"].quantile(0.8))
    tr = df[df["month_idx"] <= cut]
    te = df[df["month_idx"] > cut]
    # внутренний валидационный срез для калибровки — из конца train (тоже по времени)
    cal_cut = int(tr["month_idx"].quantile(0.85))
    fit = tr[tr["month_idx"] <= cal_cut]
    cal = tr[tr["month_idx"] > cal_cut]

    cat_idx = [MODEL_FEATURES.index(c) for c in CAT_FEATURES]

    model = CatBoostClassifier(
        loss_function="Logloss",
        eval_metric="AUC",
        iterations=iters,
        depth=6,
        learning_rate=0.06,
        l2_leaf_reg=4.0,
        random_seed=seed,
        thread_count=-1,
        verbose=0,
        allow_writing_files=False,
    )
    fit_pool = Pool(fit[MODEL_FEATURES], fit["default"], cat_features=cat_idx)
    model.fit(fit_pool)

    # калибровка вероятностей (isotonic) поверх Logloss — отдельный монотонный калiбратор,
    # который банк сможет заменить/отключить. AUC/KS от монотонного преобразования не меняются.
    calibrator: IsotonicRegression | None = None
    if len(cal) > 300:
        raw_cal = model.predict_proba(cal[MODEL_FEATURES])[:, 1]
        calibrator = IsotonicRegression(y_min=0.002, y_max=0.60, out_of_bounds="clip")
        calibrator.fit(raw_cal, cal["default"].to_numpy())

    def calibrated(X_df) -> np.ndarray:
        raw = model.predict_proba(X_df)[:, 1]
        return calibrator.predict(raw) if calibrator is not None else raw

    pd_te = calibrated(te[MODEL_FEATURES])
    y_te = te["default"].to_numpy()
    auc = float(roc_auc_score(y_te, pd_te)) if len(np.unique(y_te)) > 1 else float("nan")
    ks = ks_score(y_te, pd_te)
    pd_tr = calibrated(fit[MODEL_FEATURES])
    psi_val = psi(pd_tr, pd_te)

    grades = [grade_from_pd(float(p)) for p in pd_te]
    grade_dist: dict[str, int] = {}
    for g in ("A", "B", "C", "D"):
        grade_dist[g] = grades.count(g)

    model.save_model(os.path.join(artifacts_dir, MODEL_FILE))
    metrics = {
        "model_version": MODEL_VERSION,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_train": int(len(tr)),
        "n_test": int(len(te)),
        "auc": round(auc, 4),
        "ks": round(ks, 4),
        "psi": round(psi_val, 4),
        "grade_distribution": grade_dist,
        "default_rate_test": round(float(y_te.mean()), 4),
        "pd_mean_test": round(float(pd_te.mean()), 4),
    }
    with open(os.path.join(artifacts_dir, META_FILE), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    joblib.dump({"model": model, "metrics": metrics, "calibrator": calibrator},
                os.path.join(artifacts_dir, "scoring_bundle.joblib"))
    return TrainResult(model=model, metrics=metrics, calibrator=calibrator)


# --------------------------------- инференс ---------------------------------

class ScoringService:
    """Ленивая загрузка модели + предсказание PD/грейда/объяснимости."""

    def __init__(self, artifacts_dir: str):
        self.artifacts_dir = artifacts_dir
        self._model: CatBoostClassifier | None = None
        self._metrics: dict | None = None
        self._calibrator = None

    @property
    def available(self) -> bool:
        return os.path.exists(os.path.join(self.artifacts_dir, MODEL_FILE))

    def _ensure(self) -> None:
        if self._model is None:
            bundle_path = os.path.join(self.artifacts_dir, "scoring_bundle.joblib")
            if os.path.exists(bundle_path):
                bundle = joblib.load(bundle_path)
                self._model = bundle["model"]
                self._metrics = bundle.get("metrics", {})
                self._calibrator = bundle.get("calibrator")
            else:
                self._model = CatBoostClassifier()
                self._model.load_model(os.path.join(self.artifacts_dir, MODEL_FILE))
                self._calibrator = None
                meta = os.path.join(self.artifacts_dir, META_FILE)
                self._metrics = json.load(open(meta, encoding="utf-8")) if os.path.exists(meta) else {}

    def proba(self, X: "pd.DataFrame") -> np.ndarray:
        """Калиброванная PD (isotonic поверх Logloss), если калiбратор есть."""
        raw = self._model.predict_proba(X)[:, 1]
        if self._calibrator is not None:
            return self._calibrator.predict(raw)
        return raw

    @property
    def metrics(self) -> dict:
        self._ensure()
        return self._metrics or {}

    def score(self, row: dict) -> dict:
        """row: dict признаков (MODEL_FEATURES). Возвращает pd, грейд, топ-факторы."""
        self._ensure()
        X = pd.DataFrame([{k: row.get(k) for k in MODEL_FEATURES}])
        pd_val = float(self.proba(X)[0])
        grade = grade_from_pd(pd_val)
        factors = self.explain(row)
        return {"pd": round(pd_val, 5), "risk_grade": grade,
                "model_version": MODEL_VERSION, "top_factors": factors}

    def explain(self, row: dict, top_n: int = 5) -> list[dict]:
        """Точные SHAP-вклады CatBoost на одну заявку → top-N текстовых причин."""
        self._ensure()
        X = pd.DataFrame([{k: row.get(k) for k in MODEL_FEATURES}])
        cat_idx = [MODEL_FEATURES.index(c) for c in CAT_FEATURES]
        pool = Pool(X, cat_features=cat_idx)
        try:
            imps = self._model.get_feature_importance(type="ShapValues", data=pool)
        except Exception:
            imps = self._model.get_feature_importance(type="FeatureImportance", data=pool)
        imps = np.asarray(imps, dtype=float)
        if imps.ndim == 1:                       # глобальная важность признаков (fallback)
            imps = imps.reshape(1, -1)
        imps = imps[0][: len(MODEL_FEATURES)]    # последняя колонка ShapValues — bias, отбрасываем

        order = np.argsort(-np.abs(imps))
        out: list[dict] = []
        for i in order[:top_n]:
            feat = MODEL_FEATURES[i]
            shap = float(imps[i])
            out.append({
                "feature": feat,
                "label": FEATURE_LABELS.get(feat, feat),
                "value": _as_float(row.get(feat)),
                "shap": round(shap, 4),
                "direction": "risk_up" if shap > 0 else "risk_down",
                "text": _factor_text(feat, row.get(feat), shap),
            })
        return out


def _as_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _factor_text(feat: str, value, shap: float) -> str:
    """Короткая формулировка для консоли банка/обоснования. ↑ — к дефолту."""
    up = shap > 0
    label = FEATURE_LABELS.get(feat, feat)
    if feat == "bkii_score":
        return f"{label} {int(_as_float(value))} — {'низкая' if up else 'высокая'} оценка БКИ"
    if feat == "overdue_90d_count":
        return f"{label}: {int(_as_float(value))} — {'были крупные просрочки' if up else 'просрочек нет'}"
    if feat == "pti_current":
        return f"{label} {int(100 * _as_float(value))}% — {'высокая нагрузка' if up else 'комфортная нагрузка'}"
    if feat == "years_in_business":
        return f"бизнес {round(_as_float(value), 1)} г. — {'короткая история' if up else 'зрелая история'}"
    if feat == "has_collateral":
        return f"залог {'отсутствует' if up else 'есть'}"
    if feat == "cash_gap_flag":
        return f"кассовый разрыв {'присутствует' if up else 'не наблюдается'}"
    if feat == "loan_to_turnover":
        return f"кредит {round(_as_float(value), 1)}× к месячному обороту — {'высокая' if up else 'умеренная'} доля"
    verb = "ухудшает" if up else "улучшает"
    return f"{label} ({value}) {verb} оценку риска"

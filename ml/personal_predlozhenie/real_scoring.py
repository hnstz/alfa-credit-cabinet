"""L2-скоринг на реальных данных Kaggle (MSME Credit Data by 30S-CR).

Принцип тот же, что в синтетическом скоринге: CatBoost даёт вероятность дефолта
(PD), PD → риск-грейд, объяснимость через SHAP. Отличия диктует реальность данных:

1. Классы несбалансированы (дефолтов ~6%). Пробовали калибровку изотонической
   регрессией над Balanced-взвешенной моделью — на 320 валидационных строках она
   схлопывает PD в константу и убивает ранжирование (AUC 0.78 → 0.66). Поэтому
   модель учится обычным Logloss: его вероятности уже согласованы с базовой
   дефолтностью (средняя PD 0.055 против фактических 0.060).
2. Временны́х меток в датасете нет — split стратифицированный случайный, честно
   помечаем это в метрике (в синтетике сплит по времени, тут так нельзя).
3. Границы риск-грейдов — по квантилям распределения PD на обучении, а не
   абсолютными порогами: в популяции с базовым дефолтом 6% фиксированные 4/9/16%
   загнали бы почти всех в грейд A. Границы сохраняются в мета-файл и на проде
   не меняются.

Модель даёт только ОЦЕНКУ РИСКА. Кредитное решение и условия формируют правила
(rules.py / msme_offer.py) — скоринг ≠ решение.
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
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from . import scoring
from .kaggle_data import TARGET, feature_block, human_label

MODEL_FILE = "real_msme_catboost.cbm"
META_FILE = "real_msme_meta.json"
BUNDLE_FILE = "real_msme_bundle.joblib"
MODEL_VERSION = "l2-msme-real-2.0"

# Квантили PD → границы грейдов: A — лучшие 50%, B — до 80%, C — до 94%, D — хвост.
GRADE_QUANTILES: list[tuple[str, float]] = [("A", 0.50), ("B", 0.80), ("C", 0.94)]


def _pool(X: pd.DataFrame, cat_idx: list[int]) -> Pool:
    return Pool(X, cat_features=cat_idx)


def _cat_indexes(features: list[str]) -> list[int]:
    return [i for i, name in enumerate(features)
            if name in ("Province", "Enterprise_type", "Sector")]


def grade_from_pd(pd_val: float, bounds: list[tuple[str, float]]) -> str:
    for grade, bound in bounds:
        if pd_val < bound:
            return grade
    return "D"


def _bounds_from_quantiles(pd_fit: np.ndarray) -> list[tuple[str, float]]:
    q = {g: float(np.quantile(pd_fit, quant)) for g, quant in GRADE_QUANTILES}
    return [("A", q["A"]), ("B", q["B"]), ("C", q["C"]), ("D", float("inf"))]


@dataclass
class RealTrainResult:
    model: CatBoostClassifier
    metrics: dict


def train_real(X: pd.DataFrame, y: np.ndarray, artifacts_dir: str,
               *, iters: int = 500, seed: int = 42) -> RealTrainResult:
    """Обучить CatBoost на реальных признаках, задать грейды по квантилям, сохранить."""
    features = X.columns.tolist()
    cat_idx = _cat_indexes(features)

    X_fit, X_te, y_fit, y_te = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=seed)
    X_fit = X_fit.reset_index(drop=True)
    X_te = X_te.reset_index(drop=True)

    model = CatBoostClassifier(
        loss_function="Logloss", eval_metric="AUC",
        iterations=iters, depth=4, learning_rate=0.05, l2_leaf_reg=8.0,
        random_seed=seed, thread_count=-1, verbose=0, allow_writing_files=False)
    # CatBoost требует метку внутри Pool при fit — передаём DataFrame + cat_features.
    model.fit(X_fit, y_fit, cat_features=cat_idx)

    pd_te = model.predict_proba(_pool(X_te, cat_idx))[:, 1]
    pd_fit = model.predict_proba(_pool(X_fit, cat_idx))[:, 1]
    auc = float(roc_auc_score(y_te, pd_te)) if len(np.unique(y_te)) > 1 else float("nan")
    ks = scoring.ks_score(y_te, pd_te)
    psi = scoring.psi(pd_fit, pd_te)
    bounds = _bounds_from_quantiles(pd_fit)

    grades = [grade_from_pd(float(p), bounds) for p in pd_te]
    grade_dist = {g: grades.count(g) for g in ("A", "B", "C", "D")}

    os.makedirs(artifacts_dir, exist_ok=True)
    model.save_model(os.path.join(artifacts_dir, MODEL_FILE))
    metrics = {
        "model_version": MODEL_VERSION,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "dataset": "kaggle_msme_30scr (1707 предприятий, цель — факт дефолта)",
        "split": "stratified random (в датасете нет временной оси)",
        "n_train": int(len(X_fit)), "n_test": int(len(X_te)),
        "n_features": len(features),
        "feature_names": features,
        "auc": round(auc, 4), "ks": round(ks, 4), "psi": round(psi, 4),
        "grade_pd_bounds": {g: (round(b, 5) if np.isfinite(b) else None) for g, b in bounds},
        "grade_distribution": grade_dist,
        "base_rate_test": round(float(y_te.mean()), 4),
        "pd_mean_test": round(float(pd_te.mean()), 4),
    }
    with open(os.path.join(artifacts_dir, META_FILE), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    joblib.dump({"model": model, "metrics": metrics, "bounds": bounds,
                 "features": features},
                os.path.join(artifacts_dir, BUNDLE_FILE))
    return RealTrainResult(model=model, metrics=metrics)


class RealScoringService:
    """Инференс реальной модели: профиль МСП → PD, грейд, топ-факторы (SHAP)."""

    def __init__(self, artifacts_dir: str):
        self.artifacts_dir = artifacts_dir
        self._model: CatBoostClassifier | None = None
        self._bounds: list[tuple[str, float]] | None = None
        self._features: list[str] | None = None
        self._metrics: dict | None = None

    @property
    def available(self) -> bool:
        return os.path.exists(os.path.join(self.artifacts_dir, MODEL_FILE))

    def _ensure(self) -> None:
        if self._model is not None:
            return
        bundle = os.path.join(self.artifacts_dir, BUNDLE_FILE)
        if os.path.exists(bundle):
            data = joblib.load(bundle)
            self._model = data["model"]
            self._bounds = data["bounds"]
            self._features = data["features"]
            self._metrics = data.get("metrics", {})
        else:
            model = CatBoostClassifier()
            model.load_model(os.path.join(self.artifacts_dir, MODEL_FILE))
            meta_path = os.path.join(self.artifacts_dir, META_FILE)
            metrics = {}
            if os.path.exists(meta_path):
                metrics = json.load(open(meta_path, encoding="utf-8"))
            gp = metrics.get("grade_pd_bounds", {})
            self._model = model
            self._metrics = metrics
            self._features = list(metrics.get("feature_names") or [])
            if not self._features:  # fallback-страховка: известные колонки датасета
                from .kaggle_data import build_matrix
                self._features = build_matrix()[0].columns.tolist()
            self._bounds = [(g, float(gp[g]) if gp.get(g) is not None else float("inf"))
                            for g in ("A", "B", "C", "D")]

    @property
    def metrics(self) -> dict:
        self._ensure()
        return self._metrics or {}

    def _frame(self, profile: dict) -> pd.DataFrame:
        self._ensure()
        cat_names = {"Province", "Enterprise_type", "Sector"}
        row = {}
        for k in self._features:
            v = profile.get(k)
            if v is None:
                v = "unknown" if k in cat_names else 0
            row[k] = v
        return pd.DataFrame([row])

    def score(self, profile: dict) -> dict:
        self._ensure()
        X = self._frame(profile)
        pool = _pool(X, _cat_indexes(self._features))
        pd_val = float(self._model.predict_proba(pool)[:, 1][0])
        grade = grade_from_pd(pd_val, self._bounds)
        return {"pd": round(pd_val, 5), "risk_grade": grade,
                "model_version": MODEL_VERSION,
                "top_factors": self.explain_from(pool, profile)}

    def explain_from(self, pool: Pool, profile: dict, top_n: int = 5) -> list[dict]:
        """Топ SHAP-вкладов: технические колонки → человеческие подписи и блоки."""
        try:
            imps = self._model.get_feature_importance(type="ShapValues", data=pool)
        except Exception:
            imps = self._model.get_feature_importance(type="FeatureImportance", data=pool)
        imps = np.asarray(imps, dtype=float)
        if imps.ndim == 1:
            imps = imps.reshape(1, -1)
        imps = imps[0][: len(self._features)]
        order = np.argsort(-np.abs(imps))
        out: list[dict] = []
        for i in order[:top_n]:
            feat = self._features[i]
            shap = float(imps[i])
            out.append({"feature": feat,
                        "label": human_label(feat),
                        "block": feature_block(feat),
                        "value": _num(profile.get(feat)),
                        "shap": round(shap, 4),
                        "direction": "risk_up" if shap > 0 else "risk_down",
                        "text": _factor_text(feat, profile.get(feat), shap)})
        return out


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _factor_text(feat: str, value, shap: float) -> str:
    """Одна SHAP-строка текстом для консоли/баннера: факт + трактовка.

    Формулировка намеренно «модель относит это в зону риска/надёжности»:
    направление связи признака с дефолтом определяем не мы, а данные — например,
    в этом датасете патенты и большие обороты по штату связаны с дефолтами
    сильнее, чем кажется на взгляд из жизни.
    """
    up = shap > 0
    label = human_label(feat)
    if isinstance(value, str):
        return f"{label}: {value} — модель {'относит это в зону риска' if up else 'в зону надёжности'}"
    v = _num(value)
    if v == 0 and feature_block(feat) == "негативные события":
        return f"{label}: не зафиксировано — снижает оценку риска"
    verb = "повышает" if up else "снижает"
    return f"{label}: {v:g} — {verb} оценку риска"

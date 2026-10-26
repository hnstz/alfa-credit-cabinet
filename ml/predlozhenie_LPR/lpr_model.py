"""Модель склонности ЛПР: CatBoost предсказывает p(примёт | роль, формат, контекст).

Методика та же, что и в personal_predlozhenie (единый подход к ML в проекте):
time-based split по month_idx, CatBoost с категориальными признаками, метрики
AUC/KS в meta-файл, объяснимость через точные SHAP-вклады CatBoost.

Модель НЕ решает, кому что одобрять — это делает движок правил. Её задача —
проранжировать форматы подачи одного и того же решения для конкретной роли.
Если модель не обучена, lpr_offer ранжирует по L1-приорам из roles.py.
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

from .lpr_data import FORMAT_KEYS, LPR_FEATURES, LPR_LABELS

MODEL_FILE = "lpr_catboost.cbm"
META_FILE = "lpr_meta.json"
BUNDLE_FILE = "lpr_bundle.joblib"
MODEL_VERSION = "lpr-propensity-1.0"


def ks_score(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """Kolmogorov–Smirnov — как в скоринге, своя функция, без лишних зависимостей."""
    order = np.argsort(-y_score)
    y = np.asarray(y_true)[order]
    pos, neg = float((y == 1).sum()), float((y == 0).sum())
    tpr = np.cumsum(y == 1) / max(pos, 1)
    fpr = np.cumsum(y == 0) / max(neg, 1)
    return float(np.max(np.abs(tpr - fpr)))


@dataclass
class LprTrainResult:
    model: CatBoostClassifier
    metrics: dict


def train(df: pd.DataFrame, artifacts_dir: str, *, iters: int = 400,
          seed: int = 42) -> LprTrainResult:
    """Обучить модель склонности на синтетике взаимодействий, сохранить артефакты."""
    df = df.sort_values("month_idx").reset_index(drop=True)
    cut = int(df["month_idx"].quantile(0.8))
    tr = df[df["month_idx"] <= cut]
    te = df[df["month_idx"] > cut]

    cat_idx = [LPR_FEATURES.index(c) for c in ("lpr_role", "format_code", "org_form")]
    model = CatBoostClassifier(
        loss_function="Logloss",
        eval_metric="AUC",
        iterations=iters,
        depth=5,
        learning_rate=0.07,
        l2_leaf_reg=5.0,
        random_seed=seed,
        thread_count=-1,
        verbose=0,
        allow_writing_files=False,
    )
    model.fit(Pool(tr[LPR_FEATURES], tr["accepted"], cat_features=cat_idx))

    p_te = model.predict_proba(te[LPR_FEATURES])[:, 1]
    y_te = te["accepted"].to_numpy()
    auc = float(roc_auc_score(y_te, p_te)) if len(np.unique(y_te)) > 1 else float("nan")
    ks = ks_score(y_te, p_te)

    # метрики те же, что у скоринга: AUC/KS различают «примет/не примет» на времени вперёд,
    # accept_rate/p_mean — сверка калибровки (средняя вероятность ≈ доле принятых)
    metrics = {
        "model_version": MODEL_VERSION,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_train": int(len(tr)),
        "n_test": int(len(te)),
        "auc": round(auc, 4),
        "ks": round(ks, 4),
        "accept_rate_test": round(float(y_te.mean()), 4),
        "p_mean_test": round(float(p_te.mean()), 4),
    }
    model.save_model(os.path.join(artifacts_dir, MODEL_FILE))
    with open(os.path.join(artifacts_dir, META_FILE), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    joblib.dump({"model": model, "metrics": metrics},
                os.path.join(artifacts_dir, BUNDLE_FILE))
    return LprTrainResult(model=model, metrics=metrics)


class LprService:
    """Ленивая загрузка модели склонности + ранжирование форматов для роли."""

    def __init__(self, artifacts_dir: str):
        self.artifacts_dir = artifacts_dir
        self._model: CatBoostClassifier | None = None
        self._metrics: dict | None = None

    @property
    def available(self) -> bool:
        return os.path.exists(os.path.join(self.artifacts_dir, MODEL_FILE))

    def _ensure(self) -> None:
        if self._model is None:
            bundle = os.path.join(self.artifacts_dir, BUNDLE_FILE)
            if os.path.exists(bundle):
                data = joblib.load(bundle)
                self._model = data["model"]
                self._metrics = data.get("metrics", {})
            else:
                self._model = CatBoostClassifier()
                self._model.load_model(os.path.join(self.artifacts_dir, MODEL_FILE))
                meta = os.path.join(self.artifacts_dir, META_FILE)
                self._metrics = json.load(open(meta, encoding="utf-8")) if os.path.exists(meta) else {}

    @property
    def metrics(self) -> dict:
        self._ensure()
        return self._metrics or {}

    def p_accept(self, ctx_rows: list[dict]) -> list[float]:
        """p(принять) для каждой строки (роль+формат+контекст). Пачкой — быстрее."""
        self._ensure()
        X = pd.DataFrame(ctx_rows)[LPR_FEATURES]
        cat_idx = [LPR_FEATURES.index(c) for c in ("lpr_role", "format_code", "org_form")]
        pool = Pool(X, cat_features=cat_idx)
        probs = self._model.predict_proba(pool)[:, 1]
        return [round(float(p), 4) for p in probs]

    def rank(self, role: str, ctx_base: dict) -> list[dict]:
        """Оценить все форматы для роли → список variants, отсортированный по p."""
        rows = [{**ctx_base, "lpr_role": role, "format_code": f} for f in FORMAT_KEYS]
        probs = self.p_accept(rows)
        variants = [{"format_code": f, "p_accept": p} for f, p in zip(FORMAT_KEYS, probs)]
        variants.sort(key=lambda v: -v["p_accept"])
        return variants

    def explain(self, row: dict, top_n: int = 3) -> list[dict]:
        """Топ SHAP-вкладов для выбранного варианта — «почему модель склоннее к этому»."""
        self._ensure()
        X = pd.DataFrame([{k: row.get(k) for k in LPR_FEATURES}])
        cat_idx = [LPR_FEATURES.index(c) for c in ("lpr_role", "format_code", "org_form")]
        pool = Pool(X, cat_features=cat_idx)
        try:
            imps = self._model.get_feature_importance(type="ShapValues", data=pool)
        except Exception:
            return []
        imps = np.asarray(imps, dtype=float).reshape(-1)[: len(LPR_FEATURES)]
        order = np.argsort(-np.abs(imps))
        out = []
        for i in order[:top_n]:
            feat = LPR_FEATURES[i]
            out.append({"feature": feat,
                        "label": LPR_LABELS.get(feat, feat),
                        "value": row.get(feat),
                        "shap": round(float(imps[i]), 4),
                        "direction": "up" if imps[i] > 0 else "down"})
        return out

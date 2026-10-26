"""CLI: одна команда обучит ВСЕ модели проекта.

    python train.py                 # 15 000 заявок + 12 000 взаимодействий, seed из env
    ML_N_RECORDS=20000 python train.py

Шаги:
  1) personal_predlozhenie: синтетика заявок → CatBoost скоринг (PD, грейд) → артефакты;
  2) personal_predlozhenie: скоринг на РЕАЛЬНЫХ открытых данных Kaggle MSME
     (30S-CR) + воспроизведение ResMLP-референса для сравнения метрик;
  3) predlozhenie_LPR: синтетика взаимодействий «роль×формат» → модель склонности;
  4) демо-профили для сквозной проверки фронтом (синтетика + реальные компании);
  5) итог по артефактам.
Артефакты — в ml/artifacts/ (модели, метрики, датасеты, демо-профили).
"""
from __future__ import annotations

import json
import os

from personal_predlozhenie import (config, kaggle_data, real_scoring, resmlp_reference,
                                   scoring, synthetic)
from predlozhenie_LPR import lpr_data, lpr_model


def _demo_profiles(df) -> list[dict]:
    """По одному representative-профилю на сценарий защиты (из реальной синтетики)."""
    picks = {
        "идеальный заёмщик (одобрение)": (df[(df.ban_source == "none") & (df["default"] == 0)]
                                          .sort_values("bkii_score", ascending=False).head(1)),
        "пограничный (встречное)": (df[(df.ban_source == "none") & (df.pti_current > 0.4)]
                                    .sort_values("requested_amount", ascending=False).head(1)),
        "просрочки 90+ (отказ по риску)": (df[(df.overdue_90d_count >= 2) & (df.ban_source == "none")]
                                           .head(1)),
        "холодный старт ИП": (df[(df.years_in_business < 0.5) & (df.ban_source == "none")].head(1)),
        "кассовый разрыв (овердрафт)": (df[(df.cash_gap_flag == 1) & (df.ban_source == "none")].head(1)),
        "самозапрет на кредиты (запрет → отказ в обход модели)": (
            df[(df.ban_source == "self") & (df.pd_true < 0.04) & (df["default"] == 0)]
            .sort_values("bkii_score", ascending=False).head(1)
            if not df[(df.ban_source == "self") & (df.pd_true < 0.04)].empty
            else df[df.ban_source == "self"].head(1)),
        "налоговый долг (цель: закрыть долг)": (
            df[(df.ban_source == "none") & (df["default"] == 0) & (df.tax_debt > 0)
               & (df.overdue_90d_count == 0) & (df.cash_gap_flag == 0)
               & (df.pti_current < 0.2) & (df.applicant_age.between(21, 65))]
            .sort_values("bkii_score", ascending=False).head(1)),
        "обновление парка техники (лизинг)": (
            df[(df.ban_source == "none") & (df["default"] == 0)
               & (df.loan_purpose == "оборудование/развитие")
               & (df.sector == "Грузоперевозки") & (df.pti_current < 0.25)]
            .sort_values("bkii_score", ascending=False).head(1)),
        "рост оборота (оборотные средства)": (
            df[(df.ban_source == "none") & (df["default"] == 0)
               & (df.turnover_trend_3m_pct >= 8) & (df.cash_gap_flag == 0)
               & (df.tax_debt == 0) & (df.pti_current < 0.2) & (df.expense_ratio <= 1)
               & (df.applicant_age.between(21, 65))]
            .sort_values("bkii_score", ascending=False).head(1)),
    }
    out = []
    for title, sub in picks.items():
        if sub.empty:
            continue
        r = sub.iloc[0]
        ban_map = {"self": "self", "bank": "bank", "bailiff": "bailiff"}
        out.append({
            "scenario": title,
            "application": {
                "features": {
                    "inn": str(r["inn"]), "full_name": str(r["applicant_name"]),
                    "org_form": r["org_form"], "sector": r["sector"],
                    "years_in_business": float(r["years_in_business"]),
                    "employees": int(r["employees"]),
                    "annual_revenue": float(r["annual_revenue"]),
                    "avg_monthly_turnover": float(r["avg_monthly_turnover"]),
                    "net_profit_margin": float(r["net_profit_margin"]),
                    "expense_ratio": float(r["expense_ratio"]),
                    "cash_gap_flag": bool(r["cash_gap_flag"]),
                    "tax_debt": float(r["tax_debt"]),
                    "turnover_trend_3m_pct": float(r["turnover_trend_3m_pct"]),
                    "active_loans": int(r["active_loans"]),
                    "existing_monthly_debt": float(r["existing_monthly_debt"]),
                    "bkii_score": int(r["bkii_score"]),
                    "overdue_30d_max_days": int(r["overdue_30d_max_days"]),
                    "overdue_90d_count": int(r["overdue_90d_count"]),
                    "applicant_age": int(r["applicant_age"]),
                    "has_collateral": bool(r["has_collateral"]),
                    "region": "Москва",
                },
                "ban": {"source": ban_map.get(r["ban_source"], "none")},
                "requested_amount": float(r["requested_amount"]),
                "requested_term": int(r["requested_term"]),
                "loan_purpose": r["loan_purpose"],
            },
        })
    return out


def _train_msme(art_dir: str) -> bool:
    """Шаг на реальных данных: CatBoost-скоринг + сравнение с ResMLP-референсом."""
    if not os.path.exists(kaggle_data.default_data_path()):
        print("      ПРОПУСК: ml/data/msme_kaggle.xlsx не найден — "
              "реальный скоринг не обучен, сервис работает на синтетике")
        return False
    X, y = kaggle_data.build_matrix()
    res = real_scoring.train_real(X, y, art_dir)
    m = res.metrics
    print(f"      CatBoost (продакшн): AUC={m['auc']}  KS={m['ks']}  PSI={m['psi']}  "
          f"грейды test: {m['grade_distribution']}")
    rm = resmlp_reference.train_resmlp(X, y, art_dir)
    print(f"      ResMLP (референс Kaggle): accuracy={rm['accuracy']}  AUC={rm['auc']}  "
          f"KS={rm['ks']}  доля предсказанных «одобрить»={1 - rm['positive_predicted_rate']:.3f}")
    demos = kaggle_data.demo_profiles(X, y)
    with open(os.path.join(art_dir, "demo_msme.json"), "w", encoding="utf-8") as f:
        json.dump(demos, f, ensure_ascii=False, indent=2)
    print(f"      демо-профили МСП: {len(demos)} сценария(ев)")
    return True


def main() -> None:
    settings = config.get_settings()
    art_dir = settings.resolved_artifacts_dir()

    print("[1/5] personal_predlozhenie: генерация синтетики заявок "
          f"n={settings.n_records}, seed={settings.seed}")
    df = synthetic.generate_dataset(n=settings.n_records, seed=settings.seed)
    df.to_csv(os.path.join(art_dir, "synthetic_dataset.csv"), index=False, encoding="utf-8-sig")
    print(f"      базовая дефолтность={float(df['default'].mean()):.3f}, "
          f"доля с запретом={float((df['ban_source'] != 'none').mean()):.3f}")

    print("[2/5] personal_predlozhenie: обучение + калибровка CatBoost (time-based split)...")
    result = scoring.train(df, art_dir, seed=settings.seed)
    m = result.metrics
    print(f"      AUC={m['auc']}  KS={m['ks']}  PSI={m['psi']}")
    print(f"      грейды на test: {m['grade_distribution']}")
    print(f"      pd_mean_test={m['pd_mean_test']} default_rate_test={m['default_rate_test']}")

    print("[3/5] personal_predlozhenie: скоринг на реальных данных Kaggle MSME (30S-CR)...")
    _train_msme(art_dir)

    print(f"[4/5] predlozhenie_LPR: синтетика взаимодействий (n={settings.n_records_lpr}) "
          "и модель склонности...")
    ldf = lpr_data.generate_lpr_interactions(n=settings.n_records_lpr, seed=settings.seed)
    ldf.to_csv(os.path.join(art_dir, "lpr_interactions.csv"), index=False, encoding="utf-8-sig")
    lres = lpr_model.train(ldf, art_dir, seed=settings.seed)
    lm = lres.metrics
    print(f"      AUC={lm['auc']}  KS={lm['ks']}  accept_rate_test={lm['accept_rate_test']}")

    print("[5/5] Демо-профили для сквозной проверки/фронта...")
    demos = _demo_profiles(df)
    with open(os.path.join(art_dir, "demo_profiles.json"), "w", encoding="utf-8") as f:
        json.dump(demos, f, ensure_ascii=False, indent=2)
    print(f"      подготовлено сценариев: {len(demos)}")

    print(f"\nГотово. Артефакты в: {art_dir}")
    print("Запуск сервиса:  uvicorn app.main:app --host 0.0.0.0 --port 8000")


if __name__ == "__main__":
    main()

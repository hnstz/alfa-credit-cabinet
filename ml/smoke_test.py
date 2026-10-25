"""Локальный smoke-test: прогон demo-профилей через /pipeline напрямую (без HTTP).

Показывает три исход + ключевой кейс запрета + ГЛАВНУЮ фишку второго модуля:
как одно и то же решение переупаковывается под роль ЛПР (для каждого сценария
прогоняем все четыре роли — видно, что меняются формат, акценты и канал).

    python smoke_test.py
"""
from __future__ import annotations

import json
import os

from app.main import pipeline
from personal_predlozhenie import config
from personal_predlozhenie.schemas import Application
from predlozhenie_LPR.roles import LPR_ROLES

settings = config.get_settings()
art = settings.resolved_artifacts_dir()
path = os.path.join(art, "demo_profiles.json")
demos = json.load(open(path, encoding="utf-8"))

for d in demos:
    base = Application(**d["application"])
    # один сценарий — четыре роли ЛПР: решение то же, подача разная
    for role in LPR_ROLES:
        app_req = base.model_copy(update={"lpr_role": role})
        res = pipeline(app_req)
        s, dec, ban, lpr = res.score, res.decision, res.banner, res.lpr
        print("=" * 74)
        print(f"СЦЕНАРИЙ: {d['scenario']}  |  РОЛЬ ЛПР: {role}")
        print(f"  скор:    PD={s.pd:.3f}  грейд={s.risk_grade.value}  banned={s.is_banned}")
        print(f"  решение: {dec.outcome.value}"
              + (f"  → {dec.terms.amount:,.0f} ₽ под {dec.terms.rate}% / {dec.terms.term_months} мес"
                 f" (платёж {dec.terms.monthly_payment:,.0f} ₽, PTI={dec.terms.pti:.0%})"
                 if dec.terms else ""))
        if dec.reject_codes:
            print(f"  отказы:  {dec.reject_codes}")
        print(f"  баннер:  [{ban.kind.value}] {ban.headline}")
        if lpr:
            alt = ", ".join(f"{a.format_code}:{a.p_accept:.2f}" for a in lpr.alternatives)
            print(f"  ЛПР:     формат «{lpr.format_title}» p={lpr.p_accept:.2f} "
                  f"[{lpr.generated_by}] канал={lpr.channel}")
            print(f"           заголовки: {lpr.headline}")
            print(f"           тело: {lpr.body}")
            print(f"           акценты: {lpr.emphasis}")
            print(f"           все варианты: {alt}")

# ---------------- реальные данные Kaggle MSME (если msme-модель обучена) ----------------
msme_path = os.path.join(art, "demo_msme.json")
if os.path.exists(msme_path):
    from app.main import MsmeOfferRequest, msme_offer_pipeline
    demos_msme = json.load(open(msme_path, encoding="utf-8"))
    for d in demos_msme:
        req = MsmeOfferRequest(profile=d["profile"], lpr_role="финансовый директор")
        res = msme_offer_pipeline(req)
        s, dec, ban, lpr = res.score, res.decision, res.banner, res.lpr
        print("=" * 74)
        print(f"MSME (Kaggle): {d['scenario']}")
        print(f"  скор:    PD={s.pd:.3f}  грейд={s.risk_grade.value}  banned={s.is_banned}"
              f"  [{s.model_version}]")
        print(f"  решение: {dec.outcome.value}"
              + (f"  → {dec.terms.amount:,.0f} под {dec.terms.rate}% / {dec.terms.term_months} мес"
                 if dec.terms else ""))
        if dec.reject_codes:
            print(f"  отказы:  {dec.reject_codes}")
        for f in s.top_factors[:3]:
            print(f"  фактор: {f.text}")
        print(f"  баннер:  [{ban.kind.value}] {ban.headline}")
        if lpr:
            print(f"  ЛПР:     формат «{lpr.format_title}» p={lpr.p_accept:.2f} "
                  f"[{lpr.generated_by}] канал={lpr.channel}")
print("=" * 74)
print("OK.")

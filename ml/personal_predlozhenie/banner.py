"""Персонализированные баннеры (L1-шаблоны → опциональный LLM-слок).

Типы баннеров (соответствуют BannerKind):
- OFFER       — персональное предложение (approve или counter);
- INFO        — информ-баннер про запрет (не предложение!) — CTА «как снять»;
- EDUCATIONAL — «что улучшить», если скоринг/PTI не дали одобрения.

LLM включается env `ML_LLM_ENABLED=true` + `LLM_BASE_URL` (OpenAI-совместимый,
Ollama/vLLM). При недоступности — молчаливый fallback на шаблон, как требует
roles.md: «fallback на шаблонные тексты при недоступности LLM».
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from . import config
from .rules import ScoreInput
from .schemas import (Application, BanSource, BannerKind, BannerResponse,
                      DecisionResponse, Outcome)

BAN_TITLE: dict[BanSource, str] = {
    BanSource.SELF: "У вас активен самозапрет на кредиты",
    BanSource.BANK: "Банк ограничил кредитование по вашему профилю",
    BanSource.BAILIFF: "Кредитование недоступно: ограничение у приставов",
}
BAN_HINT: dict[BanSource, str] = {
    BanSource.SELF: ("Снять самозапрет можно через Госуслуги — решение вступит в силу "
                    "через 2 рабочих дня. После этого вернёмся к заявке."),
    BanSource.BANK: ("Сотрудник банка может пересмотреть ограничение вручную "
                     "с указанием причины. Подайте заявку — мы передадим в работу."),
    BanSource.BAILIFF: ("Нужно погасить задолженность или получить судебное снятие "
                        "ограничения. После снятия — снова откроем кредитную линию."),
}


def build(app: Application, decision: DecisionResponse,
          score: ScoreInput | None = None) -> BannerResponse:
    """Выбирает тип баннера и собирает тексты. LLM при knock-in, иначе шаблон."""
    feats = app.features
    name = _short_name(feats.full_name)

    # ---------- 1. ЖЁСТКИЙ RULE-GATE: запрет — информ-баннер, не офер ----------
    if decision.is_banned:
        source = app.ban.source
        headline = BAN_TITLE.get(source, "Кредитование временно недоступно")
        body = BAN_HINT.get(source, decision.reasons[0] if decision.reasons
                            else "Снимите ограничение, чтобы продолжить.")
        return _maybe_llm(BannerResponse(
            inn=feats.inn, kind=BannerKind.INFO,
            headline=headline, body=body,
            cta="Как снять запрет", badge="Ограничение активно",
            terms=None, reason_chips=[], generated_by="template"))

    # ---------- 2. Одобрение / встречное → OFFER ----------
    if decision.outcome in (Outcome.APPROVE, Outcome.COUNTER) and decision.terms:
        t = decision.terms
        chips = _positive_chips(decision)
        if decision.outcome == Outcome.APPROVE:
            headline = f"{name}, одобрено: {t.amount:,.0f} ₽ под {t.rate}% на {t.term_months} мес"
            body = (f"Под ваш профиль — {t.product_title}. Ежемесячный платёж "
                    f"{t.monthly_payment:,.0f} ₽, долговая нагрузка после выдачи "
                    f"{int(t.pti * 100)}% — в пределах нормы.")
            cta = "Оформить"
            badge = "Персонально для вас"
        else:
            req = app.requested_amount
            if t.amount < req - 1:
                headline = f"{name}, предлагаем {t.amount:,.0f} ₽ вместо {req:,.0f} ₽"
            else:
                headline = f"{name}, одобряем {t.amount:,.0f} ₽ на сроке {t.term_months} мес"
            body = (f"Чтобы платёж был комфортным при текущих оборотах — "
                    f"{t.product_title}, {t.rate}% на {t.term_months} мес, "
                    f"{t.monthly_payment:,.0f} ₽/мес.")
            cta = "Принять предложение"
            badge = "Встречное предложение"
        return _maybe_llm(BannerResponse(
            inn=feats.inn, kind=BannerKind.OFFER, headline=headline, body=body,
            cta=cta, badge=badge, terms=t, reason_chips=chips, generated_by="template"))

    # ---------- 3. Мягкий отказ (не по запрету) → EDUCATIONAL ----------
    tips = _improve_tips(decision)
    headline = f"{name}, пока не можем одобрить — но это поправимо"
    body = decision.reasons[0] if decision.reasons else "Оценка риска выше приемлемой."
    if tips:
        body += " Следующие шаги: " + "; ".join(tips[:3]) + "."
    return _maybe_llm(BannerResponse(
        inn=feats.inn, kind=BannerKind.EDUCATIONAL, headline=headline, body=body,
        cta="Что можно улучшить", badge="Не одобрено",
        terms=None, reason_chips=tips, generated_by="template"))


# --------------------------- вспомогательные ---------------------------

def _short_name(full: str) -> str:
    parts = full.split()
    if not parts:
        return "коллега"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[1]} {parts[0]}"[:40] if parts[0].isalpha() else parts[0]


def _positive_chips(decision: DecisionResponse) -> list[str]:
    """Топ strengths (risk_down) — показываем клиенту «почему это предложение»."""
    return [f.label for f in decision.top_factors if f.direction == "risk_down"][:3]


def _improve_tips(decision: DecisionResponse) -> list[str]:
    """Топ risk_up — что усложняет решение (деликатная формулировка)."""
    return [f.label for f in decision.top_factors if f.direction == "risk_up"][:3]


# --------------------------- LLM polish ---------------------------

def _maybe_llm(banner: BannerResponse) -> BannerResponse:
    """Опционально перефразируем headline+body «на человеческий» через open-weight LLM.

    При любом сбое — тихо остаёмся на шаблоне (fallback обязателен).
    """
    llm = config.get_settings().llm
    if not llm.enabled:
        return banner
    prompt = _build_llm_prompt(banner)
    try:
        polished = _call_llm(prompt, llm)
    except Exception:
        return banner
    if not polished:
        return banner
    parts = polished.split("|", 1)
    if len(parts) == 2:
        banner.headline = parts[0].strip()[:140] or banner.headline
        banner.body = parts[1].strip()[:360] or banner.body
        banner.generated_by = "llm"
    return banner


def _build_llm_prompt(banner: BannerResponse) -> str:
    base = (f"Ты — редактор текстов для банковского кабинета МСП. На русском, "
            f"без обещаний и новых чисел. Сохрани смысл и цифры. "
            f"Формат ответа: заголовок | текст (одно предложение). "
            f"Дано: заголовок «{banner.headline}», текст «{banner.body}».")
    if banner.kind == BannerKind.INFO:
        base += " Тон: спокойный, информативный, без давления."
    elif banner.kind == BannerKind.OFFER:
        base += " Тон: дружелюбный, конкретный, для предпринимателя."
    elif banner.kind == BannerKind.EDUCATIONAL:
        base += " Тон: деликатный, поддерживающий, не обескураживающий."
    return base


def _call_llm(prompt: str, cfg: config.LLMConfig) -> str | None:
    """POST {base}/chat/completions — OpenAI-совместимый, без доп. зависимостей."""
    url = cfg.base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": cfg.model,
        "messages": [
            {"role": "system",
             "content": "Пишем короткие понятные тексты для банка. Только ответ, без рассуждений."},
            {"role": "user", "content": prompt},
        ],
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {cfg.api_key}"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=cfg.timeout_s) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body["choices"][0]["message"]["content"]
    except (urllib.error.URLError, KeyError, TimeoutError, Exception):
        return None

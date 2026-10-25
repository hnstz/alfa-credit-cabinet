"""Баннер в вёрстке «Альфа-Бизнес Онлайн».

Модуль превращает результат конвейера, то есть BannerResponse и карточку ЛПР, в
готовый HTML. Геометрия и типографика повторяют карточки раздела специальных
предложений личного кабинета:

- ширина 294 px, высота 208 px, радиус 16 px, отступы 16 px сверху и 8 px по бокам;
- заголовок 16 на 20 px, полужирный, до двух строк;
- описание 14 на 20 px, до двух строк;
- иллюстрация прижата к правому нижнему углу и выходит за границу карточки;
- цвета продуктовых тем из вёрстки банка: аметист, салат и зелёный.

Состав полосы соответствует правилу показа из README: один персональный баннер
под роль ЛПР и два классических продуктовых баннера.

Имя клиента в карточку не выводится. Заголовок строится от задачи, которую
решает кредит: закрыть кассовый разрыв, пополнить оборотные средства, закупить
товар. Числа берутся из ответов скоринга, правил и модели склонности.
"""
from __future__ import annotations

from html import escape
from typing import Optional

from . import offers as offer_catalog
from .schemas import (BannerKind, BannerResponse, DecisionResponse,
                      ScoreResponse)

FONT_STACK = ('"Alfa Interface Sans",system-ui,-apple-system,"Segoe UI",Roboto,'
              '"Helvetica Neue",Helvetica,sans-serif')

# Продуктовые темы из вёрстки личного кабинета.
THEMES: dict[str, str] = {
    "amethyst": "#dfbfff",
    "salad": "#d6f09a",
    "junglegreen": "#a0fac6",
}

# Персональный баннер окрашивается по типу предложения.
PERSONAL_THEME: dict[str, str] = {
    BannerKind.OFFER.value: "amethyst",
    BannerKind.INFO.value: "salad",
    BannerKind.EDUCATIONAL.value: "junglegreen",
}

# Порядок продуктовых тем: персональный берёт свою, классические остальные.
THEME_ORDER: tuple[str, ...] = ("amethyst", "salad", "junglegreen")

# Задача бизнеса в короткой форме: что закрывает кредит.
TASK_PHRASES: dict[str, str] = {
    "пополнение оборотных средств": "Пополнить оборотные средства",
    "пополнение оборотного капитала": "Пополнить оборотные средства",
    "закупка товара": "Закупить товар к сезону",
    "закупка оборудования": "Обновить оборудование",
    "кассовый разрыв": "Закрыть кассовый разрыв",
    "рефинансирование": "Снизить платёж по долгам",
    "выплата зарплат": "Выплатить зарплаты в срок",
    "ремонт": "Оплатить ремонт",
}

# Если роль не передана или её нет в ответе, берётся нейтральный заголовок.
DEFAULT_TASK = "Кредит под задачу бизнеса"

# Классические баннеры витрины берутся из каталога предложений: два кредитных продукта.

# ------------------------------- иллюстрации -------------------------------

_ICONS: dict[str, str] = {
    "coins": (
        '<circle cx="116" cy="150" r="84" fill="rgba(255,255,255,.42)"/>'
        '<ellipse cx="112" cy="198" rx="50" ry="17" fill="rgba(3,3,6,.75)"/>'
        '<ellipse cx="112" cy="180" rx="50" ry="17" fill="#ffffff"/>'
        '<ellipse cx="112" cy="162" rx="50" ry="17" fill="rgba(3,3,6,.75)"/>'
        '<ellipse cx="112" cy="144" rx="50" ry="17" fill="#ffffff"/>'
        '<path d="M62 144 v18 a50 17 0 0 0 100 0 v-18" fill="none" '
        'stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
    ),
    "shield": (
        '<circle cx="116" cy="150" r="84" fill="rgba(255,255,255,.42)"/>'
        '<path d="M116 82 l54 21 v42 c0 32 -24 52 -54 63 -30 -11 -54 -31 -54 -63 '
        'v-42 z" fill="#ffffff" stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<rect x="95" y="146" width="42" height="32" rx="9" fill="rgba(3,3,6,.75)"/>'
        '<path d="M103 146 v-9 a13 13 0 0 1 26 0 v9" fill="none" '
        'stroke="rgba(3,3,6,.75)" stroke-width="6" stroke-linecap="round"/>'
    ),
    "doc": (
        '<circle cx="116" cy="150" r="84" fill="rgba(255,255,255,.42)"/>'
        '<rect x="72" y="86" width="88" height="112" rx="16" fill="#ffffff" '
        'stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<path d="M92 120 h48 M92 146 h48 M92 172 h30" stroke="rgba(3,3,6,.55)" '
        'stroke-width="6" stroke-linecap="round"/>'
    ),
    "box": (
        '<circle cx="116" cy="150" r="84" fill="rgba(255,255,255,.42)"/>'
        '<path d="M116 92 l60 26 v52 l-60 26 -60 -26 v-52 z" fill="#ffffff" '
        'stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<path d="M56 118 l60 26 60 -26 M116 144 v52" fill="none" '
        'stroke="rgba(3,3,6,.5)" stroke-width="4"/>'
    ),
    "truck": (
        '<circle cx="116" cy="150" r="84" fill="rgba(255,255,255,.42)"/>'
        '<rect x="48" y="112" width="74" height="62" rx="10" fill="#ffffff" '
        'stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<path d="M122 130 h26 l18 22 v22 h-44 z" fill="#ffffff" '
        'stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<circle cx="76" cy="178" r="15" fill="rgba(3,3,6,.75)"/>'
        '<circle cx="146" cy="178" r="15" fill="rgba(3,3,6,.75)"/>'
        '<circle cx="76" cy="178" r="5" fill="#ffffff"/>'
        '<circle cx="146" cy="178" r="5" fill="#ffffff"/>'
    ),
    "wallet": (
        '<circle cx="116" cy="150" r="84" fill="rgba(255,255,255,.42)"/>'
        '<rect x="58" y="110" width="118" height="80" rx="18" fill="#ffffff" '
        'stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<path d="M58 134 h118" stroke="rgba(3,3,6,.75)" stroke-width="4"/>'
        '<rect x="138" y="146" width="38" height="26" rx="10" '
        'fill="rgba(3,3,6,.75)"/>'
        '<circle cx="156" cy="159" r="5" fill="#ffffff"/>'
    ),
}

# --------------------------------- стили ---------------------------------

STYLE = f"""
.abn-strip{{display:flex;flex-wrap:wrap;gap:16px}}
.abn-card{{border-radius:16px;color:rgba(3,3,6,.88);display:flex;flex-direction:column;
  height:208px;justify-content:space-between;overflow:hidden;padding:16px 8px 8px;
  position:relative;text-decoration:none;user-select:none;width:294px;flex:0 0 auto;
  font-family:{FONT_STACK};transition:transform .18s ease,box-shadow .18s ease}}
.abn-card:hover{{transform:translateY(-2px);box-shadow:0 8px 24px rgba(3,3,6,.14)}}
.abn-content{{display:flex;flex-direction:column;overflow:hidden;padding:0 12px;
  position:relative;width:100%;z-index:3}}
.abn-title{{font-size:16px;line-height:20px;font-weight:700;letter-spacing:-.09px;
  margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;word-break:break-word}}
.abn-desc{{font-size:14px;line-height:20px;font-weight:400;letter-spacing:-.08px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  word-break:break-word}}
.abn-badge{{align-self:flex-start;margin-top:8px;padding:2px 8px;border-radius:8px;
  background:rgba(255,255,255,.62);font-size:12px;line-height:16px;font-weight:600}}
.abn-figure{{align-self:center;flex-shrink:0;margin:0;position:absolute;right:-22px;
  bottom:-24px;height:230px;z-index:1;pointer-events:none}}
.abn-figure svg{{display:block;height:100%;width:auto}}
.abn-amethyst{{background-color:{THEMES['amethyst']}}}
.abn-salad{{background-color:{THEMES['salad']}}}
.abn-junglegreen{{background-color:{THEMES['junglegreen']}}}
"""

PAGE_STYLE = f"""
body{{margin:0;background:#f2f3f5;color:rgba(3,3,6,.88);
  font-family:{FONT_STACK};-webkit-font-smoothing:antialiased}}
.abn-topbar{{display:flex;align-items:center;justify-content:space-between;
  background:#ffffff;padding:16px 24px;border-bottom:1px solid #e7e8eb}}
.abn-logo{{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700}}
.abn-logo span{{display:block;width:12px;height:12px;border-radius:3px;background:#ef3124}}
.abn-user{{font-size:14px;color:rgba(3,3,6,.6)}}
.abn-page{{max-width:1040px;margin:0 auto;padding:32px 24px 56px}}
.abn-panel{{background:#ffffff;border-radius:20px;padding:24px}}
.abn-panel + .abn-panel{{margin-top:20px}}
.abn-h1{{margin:0 0 4px;font-size:24px;line-height:28px;font-weight:700}}
.abn-sub{{margin:0 0 20px;font-size:14px;line-height:20px;color:rgba(3,3,6,.6)}}
.abn-basis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:12px;margin:0}}
.abn-cell{{background:#f2f3f5;border-radius:12px;padding:12px}}
.abn-cell dt{{margin:0 0 4px;font-size:12px;line-height:16px;color:rgba(3,3,6,.55)}}
.abn-cell dd{{margin:0;font-size:14px;line-height:20px;font-weight:600}}
.abn-note{{margin:16px 0 0;font-size:12px;line-height:16px;color:rgba(3,3,6,.55);
  max-width:720px}}
"""


# ------------------------------- публичное -------------------------------

def render_strip(banner: BannerResponse, lpr=None, task: str = "",
                 href: str = "#", offer: Optional[dict] = None) -> str:
    """Полоса из трёх баннеров: один персональный и два классических."""
    personal = _personal_card(banner, href, offer, task)
    used = (offer or {}).get("theme") or PERSONAL_THEME.get(banner.kind.value, "amethyst")
    rest = [t for t in THEME_ORDER if t != used]
    classics = "".join(
        _card(title=escape(item["title"]), desc=escape(item["description"]),
              theme=rest[i % len(rest)], icon=item["icon"], href=href,
              badge=None)
        for i, item in enumerate(offer_catalog.classic_cards()))
    return f"<style>{STYLE}</style><div class=\"abn-strip\">{personal}{classics}</div>"


def render_page(banner: BannerResponse, lpr, decision: DecisionResponse,
                score: ScoreResponse, caption: str = "", task: str = "",
                href: str = "#", offer: Optional[dict] = None) -> str:
    """Страница предпросмотра: та же полоса и расшифровка основания персонализации."""
    inn = escape(banner.inn)
    strip = render_strip(banner, lpr, task=task, href=href, offer=offer)
    facts = [
        ("Сценарий", caption or "демонстрационный профиль"),
        ("Задача бизнеса", offer["title"] if offer else (task or DEFAULT_TASK)),
        ("Продукт", offer["product"] if offer else "нет"),
        ("Отрасль", offer.get("sector") if offer else "нет"),
        ("Почему это предложение", offer.get("why") if offer else "оффер не показывается"),
        ("Роль ЛПР", lpr.role_title if lpr else "не определена"),
        ("Формат подачи", lpr.format_title if lpr else "нет"),
        ("Вероятность дефолта", f"{score.pd:.3f}"),
        ("Риск-грейд", score.risk_grade.value),
        ("Исход", OUTCOMES.get(decision.outcome.value, decision.outcome.value)),
        ("Тип баннера", banner.kind.value),
        ("Вероятность принятия", f"{lpr.p_accept:.2f}" if lpr else "нет"),
        ("Источник решения", lpr.generated_by if lpr else "template"),
    ]
    if decision.terms:
        t = decision.terms
        facts.insert(6, (f"Условия решения, {t.product_code}",
                         f"{money(t.amount)} под {t.rate}%, "
                         f"{t.term_months} мес, "
                         f"{money(t.monthly_payment)} в месяц"))
    cells = "".join(
        f'<div class="abn-cell"><dt>{escape(k)}</dt><dd>{escape(str(v))}</dd></div>'
        for k, v in facts)
    note = ("Вёрстка повторяет карточки раздела специальных предложений "
            "Альфа-Бизнес Онлайн: 294 на 208 пикселей, радиус 16, заголовок 16 на 20, "
            "описание 14 на 20, иллюстрация выходит за правый нижний угол. "
            "Текст и числа взяты из ответов скоринга, правил и модели склонности.")
    return (
        '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>Специальные предложения, ИНН {inn}</title>'
        f'<style>{PAGE_STYLE}{STYLE}</style></head><body>'
        '<div class="abn-topbar"><div class="abn-logo"><span></span>'
        'Альфа-Бизнес Онлайн</div>'
        f'<div class="abn-user">ИНН {inn}</div></div>'
        '<div class="abn-page">'
        '<section class="abn-panel">'
        '<h1 class="abn-h1">Специальные предложения</h1>'
        '<p class="abn-sub">Один персональный баннер и два классических продуктовых</p>'
        f'{strip}'
        '</section>'
        '<section class="abn-panel">'
        '<h1 class="abn-h1">Основание персонализации</h1>'
        '<p class="abn-sub">Значения из ответа конвейера</p>'
        f'<dl class="abn-basis">{cells}</dl>'
        f'<p class="abn-note">{escape(note)}</p>'
        '</section></div></body></html>'
    )


# ------------------------------- сборка карточки -------------------------------

OUTCOMES = {"approve": "одобрение", "counter": "встречное предложение",
            "reject": "отказ"}


def money(value: float) -> str:
    """Сумма в рублях с разрядами и неразрывным пробелом."""
    return f"{value:,.0f}".replace(",", "\u00a0") + "\u00a0₽"


def _typo(text: str) -> str:
    """Приводит текст карточки к виду без длинного тире и двойных точек."""
    text = (text or "").replace(" — ", ", ").replace("–", "-").replace("—", "-")
    while ".." in text:
        text = text.replace("..", ".")
    return text.strip()


def task_phrase(purpose: str = "", cash_gap: bool = False) -> str:
    """Короткая формулировка задачи, которую решает кредит.

    Кассовый разрыв важнее цели из заявки: клиент пришёл закрыть дыру в платежах.
    """
    if cash_gap:
        return TASK_PHRASES["кассовый разрыв"]
    key = (purpose or "").strip().lower()
    if key in TASK_PHRASES:
        return TASK_PHRASES[key]
    if key.startswith("пополнение"):
        return TASK_PHRASES["пополнение оборотных средств"]
    if key:
        return f"Цель: {key}"
    return DEFAULT_TASK


def _personal_card(banner: BannerResponse, href: str, offer: Optional[dict],
                   task: str = "") -> str:
    """Персональный баннер: задача бизнеса, сумма, ставка и срок. Без имени клиента."""
    if offer is not None:
        return _card(title=escape(_typo(offer["title"])),
                     desc=escape(offer["description"]),
                     theme=offer.get("theme") or "amethyst",
                     icon=offer.get("icon") or "coins", href=href,
                     badge=offer.get("badge") or "Персонально для вас",
                     label=offer.get("cta") or "Оформить")
    if banner.kind == BannerKind.OFFER and banner.terms:
        title = task or DEFAULT_TASK
        desc = _offer_desc(banner)
        icon = "coins"
    elif banner.kind == BannerKind.INFO:
        title = "Кредитование приостановлено"
        desc = _typo(banner.body)
        icon = "shield"
    else:
        title = "По заявке пока не одобрено"
        desc = _reason(banner.body)
        icon = "doc"
    return _card(title=escape(_typo(title)), desc=escape(desc),
                 theme=PERSONAL_THEME.get(banner.kind.value, "amethyst"),
                 icon=icon, href=href, badge=banner.badge or "Персонально для вас",
                 label=banner.cta)


# В карточке слово платёж не используется: клиент видит сумму, ставку и срок.
REASON_REWRITES: tuple[tuple[str, str], ...] = (
    ("Запрошенный платёж недоступен", "Запрошенная сумма не проходит"),
)


def _reason(body: str) -> str:
    """Оставляет только причину отказа. Перечень технических факторов в карточку не идёт."""
    text = _typo(body).split("Следующие шаги")[0].strip()
    for source, target in REASON_REWRITES:
        text = text.replace(source, target)
    return text.rstrip(" .;,") + "." if text else "Оценка риска выше допустимого порога"


def _offer_desc(banner: BannerResponse) -> str:
    """Подпись под задачей: только сумма, ставка и срок."""
    t = banner.terms
    return f"{money(t.amount)} под {t.rate}% на {t.term_months} мес"


def _card(*, title: str, desc: str, theme: str, icon: str, href: str,
          badge: Optional[str], label: str = "") -> str:
    """Одна карточка в разметке баннера личного кабинета."""
    aria = escape(". ".join(p for p in (title, desc.rstrip("."), label) if p))
    badge_html = f'<span class="abn-badge">{escape(badge)}</span>' if badge else ""
    return (
        f'<a class="abn-card abn-{theme}" href="{escape(href, quote=True)}" '
        f'data-name="{escape(title, quote=True)}" data-source="ml-banner" '
        f'aria-label="{aria}" title="{aria}">'
        '<div class="abn-content">'
        f'<span class="abn-title">{title}</span>'
        f'<span class="abn-desc">{desc}</span>'
        f'{badge_html}'
        '</div>'
        f'<figure class="abn-figure"><svg viewBox="0 0 200 230" '
        f'xmlns="http://www.w3.org/2000/svg">{_ICONS[icon]}</svg></figure>'
        '</a>'
    )

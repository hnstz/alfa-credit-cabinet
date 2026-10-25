"""Витрина: две классические карточки и одно персональное предложение.

Классические карточки это рекламный ряд продуктовой линейки, от клиента они не
зависят: сумма, ставка и срок берутся из настроек продукта.

Персональная карточка строится от цели: сначала та, что клиент назвал сам,
затем та, которую видно в данных, и только потом отрасль и роль:

1. цель, которую клиент назвал сам: техника или оборудование;
2. нужда: кассовый разрыв, налоговый долг, нагрузка по кредитам, рост оборота;
3. отрасль: подсказывает продукт, но сама по себе цель не доказывает;
4. роль ЛПР: задаёт порядок продуктов внутри отрасли.

Лизинг и оборудование показываются только при подтверждении: цель в заявке
или выбранный клиентом продукт. Отрасль и залог подтверждением цели не
считаются.

Сумма, ставка и срок считаются тем же аппаратом правил, что и кредитное
решение, поэтому в баннере нет чисел из воздуха.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from . import config, rules
from .schemas import Application, DecisionResponse, Outcome, ScoreResponse

KEY_RATE = config.get_settings().key_rate

# Продукты, уместные отрасли. Порядок важен: первый достижимый и уходит в баннер.
SECTOR_PRODUCTS: dict[str, tuple[str, ...]] = {
    "Розничная торговля": ("WORKING", "CREDIT_LINE", "OVERDRAFT"),
    "Общепит": ("WORKING", "OVERDRAFT", "INVEST"),
    "Производство": ("INVEST", "LEASING", "WORKING"),
    "Грузоперевозки": ("LEASING", "WORKING", "OVERDRAFT"),
    "Строительство": ("LEASING", "CREDIT_LINE", "WORKING"),
    "IT и услуги": ("WORKING", "CREDIT_LINE", "INVEST"),
    "Медицина": ("INVEST", "LEASING", "WORKING"),
    "Сельское хозяйство": ("OVERDRAFT", "LEASING", "WORKING"),
    "Красота и сервис": ("WORKING", "OVERDRAFT", "INVEST"),
}
DEFAULT_PRODUCTS: tuple[str, ...] = ("WORKING", "CREDIT_LINE", "INVEST")

# Оборотные продукты уместны в любой отрасли, поэтому роль может их выбрать.
UNIVERSAL_PRODUCTS: frozenset[str] = frozenset({"WORKING", "CREDIT_LINE"})

# Отрасли, где техника или оборудование берётся в лизинг.
LEASING_SECTORS: frozenset[str] = frozenset({
    "Производство", "Грузоперевозки", "Строительство",
    "Медицина", "Сельское хозяйство",
})

# Продукты, близкие роли ЛПР. Пересечение с отраслью даёт персональный выбор.
ROLE_PRODUCTS: dict[str, tuple[str, ...]] = {
    "владелец": ("WORKING", "INVEST", "CREDIT_LINE", "LEASING"),
    "финансовый директор": ("REFA", "CREDIT_LINE", "WORKING"),
    "главбух": ("OVERDRAFT", "WORKING", "CREDIT_LINE"),
    "управляющий": ("LEASING", "INVEST", "WORKING"),
}

# Задача в заголовке карточки: что именно закрывает кредит.
PRODUCT_TASK: dict[str, str] = {
    "OVERDRAFT": "Закрыть кассовый разрыв",
    "WORKING": "Пополнить оборотные средства",
    "CREDIT_LINE": "Открыть кредитную линию",
    "INVEST": "Обновить оборудование",
    "LEASING": "Взять технику в лизинг",
    "REFA": "Снизить платёж по долгам",
}

# Отраслевая формулировка точнее общей: она и делает баннер персональным.
SECTOR_TASK: dict[tuple[str, str], str] = {
    ("Розничная торговля", "WORKING"): "Закупить товар к сезону",
    ("Общепит", "WORKING"): "Закупить продукты и расходники",
    ("Производство", "INVEST"): "Обновить станки",
    ("Производство", "LEASING"): "Взять оборудование в лизинг",
    ("Грузоперевозки", "LEASING"): "Взять тягач в лизинг",
    ("Строительство", "LEASING"): "Взять технику в лизинг",
    ("Медицина", "INVEST"): "Купить медоборудование",
    ("Медицина", "LEASING"): "Взять медтехнику в лизинг",
    ("Сельское хозяйство", "OVERDRAFT"): "Перекрыть сезонный разрыв",
    ("Сельское хозяйство", "LEASING"): "Взять агротехнику в лизинг",
    ("IT и услуги", "WORKING"): "Закрыть фонд оплаты труда",
}

# Слова цели, которыми клиент сам подтверждает покупку актива.
ASSET_WORDS: tuple[str, ...] = ("оборуд", "лизинг", "техник", "станк",
                                "транспорт", "автопарк")

ICONS: dict[str, str] = {
    "OVERDRAFT": "wallet",
    "WORKING": "coins",
    "CREDIT_LINE": "box",
    "REFA": "doc",
    "INVEST": "box",
    "LEASING": "truck",
}

# Рекламный ряд линейки: продукт, сумма и срок. Ставка считается от ключевой.
CLASSIC_LINEUP: tuple[tuple[str, str, float, int], ...] = (
    ("Кредит на оборотные средства", "WORKING", 3_000_000, 24),
    ("Кредитная линия", "CREDIT_LINE", 5_000_000, 24),
)


@dataclass(frozen=True)
class Goal:
    """Цель баннера: что закрывают деньги, каким продуктом и на каком основании."""

    code: str
    title: str
    product: str
    why: str = ""


def money(value: float) -> str:
    """Сумма в рублях с разрядами и неразрывным пробелом."""
    return f"{value:,.0f}".replace(",", "\u00a0") + "\u00a0₽"


def rate_text(value: float) -> str:
    """Ставка без хвостового нуля: 19.0 процента печатается как 19."""
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _rate(grade: str, product: config.Product) -> float:
    """Ставка = ключевая + спред грейда + спред продукта."""
    low = config.GRADE_RATE_SPREAD.get(grade, config.GRADE_RATE_SPREAD["C"])[0]
    return round(KEY_RATE + low + product.base_spread, 1)


def _percent_phrase(value: float) -> str:
    """Число процентов словом: 6 процентов, 6,4 процента, 21 процент."""
    text = f"{abs(value):.1f}".rstrip("0").rstrip(".").replace(".", ",")
    if "," in text:
        return f"{text} процента"
    n = int(text) % 100
    if 11 <= n <= 14 or n % 10 == 0 or n % 10 >= 5:
        word = "процентов"
    elif n % 10 == 1:
        word = "процент"
    else:
        word = "процента"
    return f"{text} {word}"


def _quote(app_req: Application, grade: str,
           product: config.Product) -> Optional[tuple[float, float, int]]:
    """Сумма, ставка и срок под продукт.

    Сумма это доступный лимит, а не то, что клиент запросил в анкете:
    баннер показывает, сколько банк готов дать заранее.
    """
    f = app_req.features
    income = max(f.avg_monthly_turnover * (1.0 - f.expense_ratio), 20_000.0)
    cap = config.PTI_CAP.get(grade, 0.40)
    budget = max(income * cap - f.existing_monthly_debt, 0.0)
    term = int(min(max(app_req.requested_term, product.min_term), product.max_term))
    rate = _rate(grade, product)
    afford = rules.max_principal(budget, rate, term)
    # Пол продукта, или запрошенная сумма, если она меньше, не даёт карточке
    # показать лимит ниже минимального билета банка.
    floor = min(product.min_amount, float(app_req.requested_amount))
    amount = min(max(afford, floor), product.max_amount)
    amount = float(int(amount // 10_000 * 10_000))
    if budget <= 0 or amount < 100_000:
        return None
    return amount, rate, term


def classic_cards() -> list[dict]:
    """Две классические карточки витрины. Числа рекламные, от клиента не зависят."""
    cards: list[dict] = []
    for title, code, amount, term in CLASSIC_LINEUP:
        product = config.PRODUCTS[code]
        cards.append({
            "title": title,
            "description": (f"До {money(amount)}, от {rate_text(_rate('A', product))}% "
                            f"на {term} мес"),
            "icon": ICONS.get(code, "coins"),
        })
    return cards


def _sector_key(sector: str) -> Optional[str]:
    """Название отрасли без учёта регистра и пробелов по краям."""
    text = (sector or "").strip().lower()
    for name in SECTOR_PRODUCTS:
        if name.lower() == text:
            return name
    return None


def _asset_confirmed(app_req: Application) -> bool:
    """Клиент сам сказал про технику: цель в заявке или выбранный продукт."""
    purpose = (app_req.loan_purpose or "").strip().lower()
    if any(word in purpose for word in ASSET_WORDS):
        return True
    return (app_req.preferred_product or "").upper() in {"INVEST", "LEASING"}


def _feasible(product: str, app_req: Application) -> bool:
    """Продукт уместен, только если нужда или актив подтверждены."""
    f = app_req.features
    if product == "OVERDRAFT":
        return f.cash_gap_flag
    if product == "REFA":
        return f.active_loans >= 1 and f.existing_monthly_debt > 0
    if product == "LEASING":
        return _asset_confirmed(app_req)
    if product == "INVEST":
        return _asset_confirmed(app_req)
    return True


def _title_for(code: str, sector: Optional[str]) -> str:
    return SECTOR_TASK.get((sector or "", code)) or PRODUCT_TASK[code]


def _role_products(app_req: Application, role_key: str,
                   sector: Optional[str]) -> list[str]:
    """Продукты роли внутри отрасли, затем продукты отрасли."""
    by_sector = SECTOR_PRODUCTS.get(sector or "", DEFAULT_PRODUCTS)
    by_role = ROLE_PRODUCTS.get(role_key, ())
    order = [code for code in by_role
             if code in by_sector or code in UNIVERSAL_PRODUCTS]
    order += list(by_sector)
    return list(dict.fromkeys(order))


def _business_goal(app_req: Application, sector: Optional[str]) -> Goal:
    """Цель по обороту. Рост оборота уточняет формулировку."""
    f = app_req.features
    if f.turnover_trend_3m_pct >= 5:
        return Goal("GROWTH", "Пополнить оборот на росте", "WORKING",
                    f"оборот вырос на {_percent_phrase(f.turnover_trend_3m_pct)} "
                    "за 3 месяца")
    return Goal("WORKING", _title_for("WORKING", sector), "WORKING")


def _stated_goal(app_req: Application, sector: Optional[str]) -> Optional[Goal]:
    """Цель, которую клиент назвал сам: она сильнее любой догадки по данным."""
    purpose = (app_req.loan_purpose or "").strip().lower()
    named = any(word in purpose for word in ASSET_WORDS)
    preferred = (app_req.preferred_product or "").upper()
    if preferred in {"INVEST", "LEASING"}:
        code = preferred
    elif named:
        code = "LEASING" if sector in LEASING_SECTORS else "INVEST"
    else:
        return None
    why = f"цель в заявке: {purpose}" if named else "клиент выбрал этот продукт"
    return Goal("ASSET", _title_for(code, sector), code, why)


def _goals(app_req: Application, role_key: str,
           sector: Optional[str]) -> list[Goal]:
    """Цели по убыванию силы доказательства: клиент, данные, затем роль и отрасль."""
    f = app_req.features
    goals: list[Goal] = []
    stated = _stated_goal(app_req, sector)
    if stated:
        goals.append(stated)
    if f.cash_gap_flag:
        goals.append(Goal("CASH_GAP", "Закрыть кассовый разрыв", "OVERDRAFT",
                          "в обороте виден кассовый разрыв"))
    if f.tax_debt > 0:
        goals.append(Goal("TAX_DEBT", "Закрыть налоговый долг", "WORKING",
                          f"налоговый долг {money(f.tax_debt)}"))
    if f.active_loans >= 1 and f.existing_monthly_debt > 0:
        goals.append(Goal("REFI", "Снизить платёж по долгам", "REFA",
                          f"платёж по долгам {money(f.existing_monthly_debt)} в месяц"))
    business = _business_goal(app_req, sector)
    for code in _role_products(app_req, role_key, sector):
        goals.append(business if code == "WORKING"
                     else Goal(code, _title_for(code, sector), code))

    out: list[Goal] = []
    seen: set[tuple[str, str]] = set()
    for goal in goals:
        key = (goal.product, goal.title)
        if key in seen or not _feasible(goal.product, app_req):
            continue
        seen.add(key)
        out.append(goal)
    return out


def _why_text(goal: Goal, sector: Optional[str], role_key: str) -> str:
    parts = [goal.why] if goal.why else []
    if sector:
        parts.append(f"отрасль: {sector}")
    if role_key:
        parts.append(f"роль ЛПР: {role_key}")
    return ", ".join(parts)


def personal_offer(app_req: Application, score: ScoreResponse,
                   decision: DecisionResponse,
                   role: Optional[str] = None) -> Optional[dict]:
    """Персональная карточка или None, если оффер показывать нельзя."""
    if score.is_banned or decision.outcome == Outcome.REJECT:
        return None

    role_key = (role or app_req.lpr_role or "владелец").strip().lower()
    sector = _sector_key(app_req.features.sector)
    grade = score.risk_grade.value
    # Условия решения и карточка не должны расходиться на одном экране.
    decision_product = rules.match_product(app_req).code

    for goal in _goals(app_req, role_key, sector):
        product = config.PRODUCTS.get(goal.product)
        if product is None:
            continue
        if decision.terms is not None and goal.product == decision_product:
            amount = decision.terms.amount
            rate = decision.terms.rate
            term = decision.terms.term_months
        else:
            quote = _quote(app_req, grade, product)
            if quote is None:
                continue
            amount, rate, term = quote
        return {
            "product": product.code,
            "goal": goal.code,
            "title": goal.title,
            "description": f"До {money(amount)} под {rate_text(rate)}% на {term} мес",
            "icon": ICONS.get(product.code, "coins"),
            "theme": "amethyst",
            "badge": "Персонально для вас",
            "cta": "Оформить",
            "sector": sector or app_req.features.sector,
            "why": _why_text(goal, sector, role_key),
        }
    return None

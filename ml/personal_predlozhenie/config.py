"""Конфигурация ML-сервиса. Всё, что может менять банк, — из env, не из кода.

Принцип роли (roles.md): скоринг ≠ решение. Модель даёт оценку риска,
итоговое решение — правила + возможность ручного override на консоли банка.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache


class RiskGrade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _env_f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_i(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_b(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# ---- Риск-грейды: границы PD (калиброванные вероятности дефолта) ----
# Пороги обоснованы так, чтобы НЕ все заявки одобрялись и ставки не были «0,5%».
RISK_GRADE_BOUNDS: list[tuple[str, float]] = [
    ("A", 0.04),   # PD < 4%  — низкий риск
    ("B", 0.09),   # PD < 9%  — приёмлемый
    ("C", 0.16),   # PD < 16% — пограничный (встречное предложение)
    ("D", 1.01),   # PD >= 16% — высокий риск (отказ)
]

# Вилка ставки по грейду = KEY_RATE + spread (п.п.). Ставка растёт с риском.
GRADE_RATE_SPREAD: dict[str, tuple[float, float]] = {
    "A": (2.0, 4.0),
    "B": (4.5, 7.0),
    "C": (7.5, 11.0),
}

# Максимальная долговая нагрузка (PTI = ежемесячный платёж по всем кредитам / доход).
PTI_CAP: dict[str, float] = {"A": 0.50, "B": 0.45, "C": 0.40}

# Порог «встречного» пересмотра: если запрошенная сумма не влезает в PTI-лимит,
# но одобримый лимит >= COUNTER_MIN_RATIO от запрошенного — даём встречное, а не отказ.
COUNTER_MIN_RATIO = 0.35

# Регуляторно-элигибилитные жёсткие границы (до модели).
MIN_YEARS_IN_BUSINESS = 0.5   # меньше 6 мес — холодный старт, базово отказ
MIN_AGE_YEARS = 21
MAX_AGE_YEARS = 75


@dataclass(frozen=True)
class Product:
    """Продукт линейки МСП. Суммы в ₽, срок в мес, rate_floor — мин possible ставка %."""
    code: str
    title: str
    purpose: str          # финансируемая цель
    min_amount: float
    max_amount: float
    min_term: int
    max_term: int
    base_spread: float    # доп. спред к грейд-ставке (рискованность самого продукта)
    org_forms: tuple[str, ...] = ("ООО", "ИП", "Самозанятый")


# Продуктовая линейка (обоснование — у PM в продуктов лонке; здесь параметры).
PRODUCTS: dict[str, Product] = {
    "OVERDRAFT": Product("OVERDRAFT", "Овердрафт", "кассовый разрыв",
                          300_000, 5_000_000, 3, 12, 1.5),
    "WORKING": Product("WORKING", "Оборотный кредит", "пополнение оборотных средств",
                        500_000, 15_000_000, 6, 36, 0.0),
    "CREDIT_LINE": Product("CREDIT_LINE", "Кредитная линия", "регулируемые закупки",
                            1_000_000, 30_000_000, 6, 24, 0.5),
    "INVEST": Product("INVEST", "Инвестиционный кредит", "оборудование/развитие",
                       1_000_000, 50_000_000, 12, 60, 1.0),
    "LEASING": Product("LEASING", "Лизинг техники", "лизинг техники",
                        500_000, 20_000_000, 12, 48, 0.8),
    "REFA": Product("REFA", "Рефинансирование", "снижение нагрузки по долгам",
                     500_000, 20_000_000, 12, 60, 0.5),
}


@dataclass
class LLMConfig:
    """Open-weight LLM через OpenAI-совместимый endpoint (Ollama/vLLM). По умолчанию ВЫКЛ.

    Фолбэк на шаблоны обязателен: при недоступности LLM лента/баннеры не ломаются.
    """
    enabled: bool = field(default_factory=lambda: _env_b("ML_LLM_ENABLED", False))
    base_url: str = field(default_factory=lambda: _env("LLM_BASE_URL", "http://localhost:11434/v1"))
    model: str = field(default_factory=lambda: _env("LLM_MODEL", "qwen2.5:7b-instruct"))
    api_key: str = field(default_factory=lambda: _env("LLM_API_KEY", "ollama"))
    timeout_s: float = field(default_factory=lambda: _env_f("ML_LLM_TIMEOUT_S", 8.0))
    max_tokens: int = field(default_factory=lambda: _env_i("ML_LLM_MAX_TOKENS", 220))
    temperature: float = field(default_factory=lambda: _env_f("ML_LLM_TEMPERATURE", 0.4))


@dataclass
class Settings:
    key_rate: float = field(default_factory=lambda: _env_f("ML_KEY_RATE", 17.0))  # % — сверить на день защиты
    artifacts_dir: str = field(default_factory=lambda: _env("ML_ARTIFACTS_DIR", ""))
    seed: int = field(default_factory=lambda: _env_i("ML_SEED", 42))
    n_records: int = field(default_factory=lambda: _env_i("ML_N_RECORDS", 15000))
    # синтетика для модели склонности ЛПР (модуль predlozhenie_LPR)
    n_records_lpr: int = field(default_factory=lambda: _env_i("ML_LPR_N_RECORDS", 12000))
    llm: LLMConfig = field(default_factory=LLMConfig)

    def resolved_artifacts_dir(self) -> str:
        d = self.artifacts_dir or os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "artifacts")
        os.makedirs(d, exist_ok=True)
        return d


@lru_cache
def get_settings() -> Settings:
    return Settings()

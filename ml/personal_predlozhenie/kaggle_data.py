"""Загрузка и подготовка открытого датасета Kaggle «MSME Credit Data by 30S-CR».

Реальные публичные данные по малым и средним предприятиям (Китай): 1707 компаний,
86 признаков, цель `Label` (1 = дефолт, базовая доля ~6%). Мы берём их как основу
L2-скоринга: по этим данным модель учится отличать дефолторов от надёжных заёмщиков,
а её вывод (PD → риск-грейд) питает формирование персонального предложения.

Рецепт подготовки признаков повторяет лучшее открытое решение под этот датасет
(ноутбук «MSME Credit Data by 30S-CR | TensorFlow ResMLP»), которое мы
воспроизвели и с которым сравнили нашу модель:

1. `Enterprise_id` убираем — порядковый номер коррелирует с дефолтом, но для новой
   компании это утечка, а не признак.
2. Категории (Province / Enterprise_type / Sector) кодируются числами; в нашей
   CatBoost-версии они остаются строками — CatBoost умеет категории нативно.
3. Вещественные колонки с тяжёлыми хвостами (капиталы, стаж, численность,
   страховки) пропускаются через fillna(1), 0→1 и округлённый log2: вместо
   абсолютных чисел получаем шкалу порядка величины (1..256 сотрудников → 0..8).
4. Счётчики событий по временным окнам (t-1…t-5+) оставляем как есть: каждое окно
   отдельно — агрегация суммой теряет сигнал (проверено: AUC 0.73 против 0.81).

FEATURE_LABELS переводит технические имена колонок в человеческие подписи —
это используется в объяснении решения (SHAP-факторы) и в educational-баннере.
"""
from __future__ import annotations

import os
import re

import numpy as np
import pandas as pd

TARGET = "default"
_RAW_TARGET = "Label"
_LEAK_COLUMNS = ["Enterprise_id"]

# Колонки-«тяжёлые хвосты»: к ним применяется log2-шкала референса.
_FLOAT_SCALE_COLUMNS = [
    "Registered_capital (Ten thousand Yuan)",
    "Establishment_Duration (Days)",
    "Paid_in_capital (Ten thousand Yuan)",
    "SH_num", "MS_num", "Branch_num",
]  # + все страховые колонки t-1/t-2/t-3 (добавляются по маске ниже)

_CAT_COLUMNS = ["Province", "Enterprise_type", "Sector"]

# ---------------------------------------------------------------------------
# Человеческие подписи колонок (по data description датасета).

_INSURANCE_RU = {
    "Basic old-age insurance for urban employees": "пенсионное страхование",
    "Unemployment insurance": "страхование от безработицы",
    "Basic medical insurance for employees": "медстрахование сотрудников",
    "Employment injury insurance": "страхование от несчастных на производстве",
    "Birth insurance": "страхование на случай беременности",
}

_WINDOW_RU = {"5years+": "за 5+ лет", "5years": "за 5 лет", "4years": "за 4 года",
              "3years": "за 3 года", "2years": "за 2 года", "1year": "за год",
              "1years": "за год"}

_PREFIX_RU = [
    (re.compile(r"^CL_(.+)$"), lambda w: f"изменения в реестре {w}"),
    (re.compile(r"^Certificate_num_(.+)$"), lambda w: f"сертификаты и аттестации {w}"),
    (re.compile(r"^Executee_num_(.+)$"), lambda w: f"исполнительные производства {w}"),
    (re.compile(r"^Overdue_tax_num_(.+)$"), lambda w: f"просрочки налогов {w}"),
    (re.compile(r"^Administrative_penalty_num_(.+)$"), lambda w: f"административные штрафы {w}"),
    (re.compile(r"^Trademark_info_num_(.+)$"), lambda w: f"товарные знаки {w}"),
    (re.compile(r"^Patent_info_num_(.+)$"), lambda w: f"патенты {w}"),
    (re.compile(r"^Work_copyright_info_num_(.+)$"), lambda w: f"авторские права {w}"),
    (re.compile(r"^Software_copyright_info_num_(.+)$"), lambda w: f"права на ПО {w}"),
    (re.compile(r"^W?Legal_proceedings_num_(.+)$"), lambda w: f"судебные разбирательства {w}"),
    (re.compile(r"^Filing_information_num_(.+)$"), lambda w: f"иски и регистрации {w}"),
]


def human_label(col: str) -> str:
    """Имя колонки датасета → понятная подпись для консоли/баннера."""
    if col == "Branch_num":
        return "число филиалов"
    if col == "SH_num":
        return "число учредителей"
    if col == "MS_num":
        return "основной персонал"
    if col.startswith("Registered_capital"):
        return "уставный капитал"
    if col.startswith("Paid_in_capital"):
        return "оплаченный капитал"
    if col == "Establishment_Duration (Days)":
        return "возраст бизнеса (дни)"
    if col in _CAT_COLUMNS:
        return {"Province": "регион", "Enterprise_type": "организационная форма",
                "Sector": "отрасль"}[col]
    if col == "Ratepaying_Credit_Grade_A_num":
        return "годы с налоговым кредит-грейдом A"
    m = re.match(r"^t-(\d) (.+)$", col)
    if m:
        kind = _INSURANCE_RU.get(m.group(2).strip(), m.group(2).strip())
        return f"{kind} — число застрахованных за {m.group(1)} г. назад"
    for pattern, make in _PREFIX_RU:
        g = pattern.match(col)
        if g:
            window = _WINDOW_RU.get(g.group(1), g.group(1))
            return make(window)
    return col


# Блоки смысла — для группировки факторов в объяснении и educational-баннера.
_BLOCK_BY_KIND = [
    (re.compile(r"^CL_"), "нестабильность"),
    (re.compile(r"^(Executee|Overdue_tax|Administrative_penalty|W?Legal_proceedings|Filing_information)"),
     "негативные события"),
    (re.compile(r"^(Certificate|Trademark|Patent|Work_copyright|Software_copyright|Ratepaying)"),
     "деловая репутация"),
    (re.compile(r"insurance"), "стабильность занятости"),
    (re.compile(r"(capital|Establishment|SH_num|MS_num|Branch)"), "зрелость и масштаб"),
]


def feature_block(col: str) -> str:
    for pattern, block in _BLOCK_BY_KIND:
        if pattern.search(col):
            return block
    return "профиль"


# ---------------------------------------------------------------------------


def default_data_path() -> str:
    """ml/data/msme_kaggle.xlsx — лежит рядом с кодом, не зависит от cwd."""
    ml_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(ml_root, "data", "msme_kaggle.xlsx")


def load_msme(path: str | None = None) -> pd.DataFrame:
    """Сырой датасет как есть — для исследования и отладки."""
    return pd.read_excel(path or default_data_path())


def build_matrix(path: str | None = None) -> tuple[pd.DataFrame, np.ndarray]:
    """Сырой датасет → (X, y) по рецепту референса, но с нативными категориями.

    Возвращает DataFrame со всеми признаками (после log2-шкалирования тяжёлых
    хвостов) и вектор цели `default`. Порядок колонок: float-шкала, категории,
    счётчики — стабилен между запусками.
    """
    raw = load_msme(path)
    raw = raw.drop(columns=[c for c in _LEAK_COLUMNS if c in raw.columns])
    y = raw[_RAW_TARGET].to_numpy().astype(int)
    X = raw.drop(columns=[_RAW_TARGET]).copy()

    float_cols = [c for c in X.columns
                  if c in _FLOAT_SCALE_COLUMNS or c.startswith("t-")]
    for c in float_cols:
        v = X[c].fillna(1)
        v = pd.Series(np.where(v == 0, 1.0, v), index=X.index)
        X[c] = np.round(np.log2(v.astype(float)))

    for c in _CAT_COLUMNS:
        X[c] = X[c].fillna("unknown").astype(str)

    count_cols = [c for c in X.columns if c not in float_cols + _CAT_COLUMNS]
    X = X[float_cols + _CAT_COLUMNS + count_cols]
    return X, y


def feature_names(X: pd.DataFrame) -> list[str]:
    return X.columns.tolist()


def production_profile(row: pd.Series | dict) -> dict:
    """Строка датасета → профиль для real_scoring.RealScoringService.score().

    NumPy-скаляры превращаем в нативные float/str — чтобы профиль можно было
    сохранить в JSON и отправить по HTTP без сюрпризов сериализации.
    """
    src = row.to_dict() if isinstance(row, pd.Series) else dict(row)
    out: dict = {}
    for k, v in src.items():
        if k in _LEAK_COLUMNS or k == _RAW_TARGET:
            continue
        if isinstance(v, (np.integer, np.floating)):
            out[k] = float(v)
        elif isinstance(v, np.str_):
            out[k] = str(v)
        else:
            out[k] = v
    return out


def demo_profiles(X: pd.DataFrame, y: np.ndarray) -> list[dict]:
    """Представительные компании под сценарии защиты — прямо из реальных строк."""
    df = X.copy()
    df[TARGET] = y
    out: list[dict] = []

    def add(title: str, sub: pd.DataFrame):
        if sub is None or len(sub) == 0:
            return
        out.append({"scenario": title, "profile": production_profile(sub.iloc[0])})

    low = df[(df[TARGET] == 0)]
    add("зрелая компания без негатива (низкий риск)",
        low[low.filter(like="Overdue_tax").sum(axis=1) == 0]
          .sort_values("Establishment_Duration (Days)", ascending=False).head(1))
    patents = df.filter(like="Patent_info_num_").sum(axis=1)
    add("компания с большим IP-портфелем (патенты, знаки, ПО)",
        df.loc[patents.sort_values(ascending=False).index[:1]])
    tax = df.filter(like="Overdue_tax").sum(axis=1)
    add("налоговые просрочки (высокий риск)",
        df.loc[tax.sort_values(ascending=False).index[:1]])
    exec_recent = df.filter(like="Executee_num_1year").sum(axis=1)
    add("свежие исполнительные производства — включается жёсткий rule-gate (приставы)",
        df.loc[exec_recent.sort_values(ascending=False).index[:1]])
    cl = df.filter(like="CL_").sum(axis=1)
    add("нестабильность: частые правки в реестре",
        df.loc[cl.sort_values(ascending=False).index[:1]])
    return out

#!/usr/bin/env bash
# Локальный запуск ML-sidecar (Linux/macOS).
#   ./run.sh            — обучить (если нужно) и поднять сервис
#   ./run.sh train      — только переобучить обе модели
#   ./run.sh smoke      — только демо-сценарии
set -euo pipefail
cd "$(dirname "$0")"
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

PY="./.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "Создаю venv + ставлю зависимости..."
  python3 -m venv --system-site-packages .venv || python3 -m venv .venv
  "$PY" -m pip install --disable-pip-version-check -r requirements.txt
fi

if [[ "${1:-}" == "smoke" ]]; then exec "$PY" smoke_test.py; fi
if [[ "${1:-}" == "train" || ! -f "./artifacts/scoring_catboost.cbm" || ! -f "./artifacts/lpr_catboost.cbm" ]]; then
  echo "Обучение обеих моделей..."; "$PY" train.py
fi

echo "Сервис: http://localhost:8000  (Swagger: /docs)"
exec "$PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

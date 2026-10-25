# Локальный запуск ML-sidecar на Windows (PowerShell).
#   .\run.ps1            — обучить (если нет артефактов) и поднять сервис
#   .\run.ps1 -Train     — только переобучить обе модели
#   .\run.ps1 -Smoke     — только прогнать демо-сценарии
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONUTF8 = "1"; $env:PYTHONIOENCODING = "utf-8"

$py = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Создаю venv (наследует системные пакеты) + ставлю совместимый starlette..." -ForegroundColor Cyan
    python -m venv --system-site-packages .venv
    & $py -m pip install --disable-pip-version-check -r requirements.txt
}

if ($args -contains "-Smoke") { & $py smoke_test.py; exit }

$needTrain = -not (Test-Path ".\artifacts\scoring_catboost.cbm") -or -not (Test-Path ".\artifacts\lpr_catboost.cbm")
if ($args -contains "-Train" -or $needTrain) {
    Write-Host "Обучение модели..." -ForegroundColor Cyan
    & $py train.py
}

Write-Host "Сервис: http://localhost:8000  (Swagger: /docs)" -ForegroundColor Green
& $py -m uvicorn app.main:app --host 127.0.0.1 --port 8000

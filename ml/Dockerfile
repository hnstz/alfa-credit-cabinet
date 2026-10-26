# ML sidecar — скоринг + правила + баннеры (personal_predlozhenie)
# и модель склонности для роли ЛПР (predlozhenie_LPR).
# Модели обучаются на этапе сборки образа (детерминированно по seed): скоринг на
# синтетике заявок, скоринг на реальных открытых данных Kaggle MSME (ml/data/) и
# модель склонности по ЛПР. Прогону жюри не нужны ни GPU, ни интернет, ни шаг обучения.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    ML_ARTIFACTS_DIR=/app/artifacts

WORKDIR /app

# libgomp1 нужен CatBoost (manylinux-колеса тянут OpenMP)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY personal_predlozhenie ./personal_predlozhenie
COPY predlozhenie_LPR ./predlozhenie_LPR
COPY data ./data
COPY train.py smoke_test.py ./

# обучение: синтетика-скоринг + реальный MSME-скоринг (+ ResMLP-сравнение) + склонность ЛПР
ARG ML_SEED=42
ARG ML_N_RECORDS=15000
ARG ML_LPR_N_RECORDS=12000
ENV ML_SEED=${ML_SEED} ML_N_RECORDS=${ML_N_RECORDS} ML_LPR_N_RECORDS=${ML_LPR_N_RECORDS}
RUN python train.py

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

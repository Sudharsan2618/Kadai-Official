# Kadai API — container image for Cloud Run.
#
# Build context is backend/. Two stages so build tooling for psycopg2 and
# cryptography never ships in the runtime layer.

# ── Stage 1: build wheels ───────────────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /wheels
COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt


# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    # Cloud Run defaults; override per service.
    PORT=8080 \
    APP_ENV=production \
    JSON_LOGS=true

# libpq5 is the psycopg2 runtime dependency; curl is for the HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels requirements.txt

# Non-root: Cloud Run doesn't require it, but nothing here needs root either.
RUN useradd --create-home --uid 10001 kadai
WORKDIR /srv
COPY --chown=kadai:kadai app ./app
USER kadai

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

# ONE worker on purpose: the SSE broker and the paced-broadcast tasks are
# in-process state. Scale with instances behind session affinity, not workers.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --timeout-keep-alive 75

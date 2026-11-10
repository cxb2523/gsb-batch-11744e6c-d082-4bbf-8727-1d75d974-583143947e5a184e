# GRID backend (FastAPI). Build from the repo root:
#   docker build -f backend/Dockerfile -t grid-backend ./backend
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# psycopg2-binary and cryptography ship wheels, but libpq is still needed at
# runtime; curl is there for the container healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- dependencies ----------
# Installed from pyproject alone so this layer is cached across code changes.
FROM base AS deps
COPY pyproject.toml ./
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && mkdir -p app && touch app/__init__.py \
 && /opt/venv/bin/pip install .

# ---------- runtime ----------
FROM base AS runtime

COPY --from=deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY app ./app
COPY pyproject.toml ./
# scripts/init_db.py prepares a fresh database (indexes, master data, first
# admin) and is run against a deployed stack with `docker compose run --rm
# backend python -m scripts.init_db`, so it has to be in the image.
COPY scripts ./scripts

# All attachments (ticket and lifecycle) are written under /app/uploads,
# which docker-compose mounts as a named volume. APP_DATA_DIR points the
# storage backend here so this stays the on-disk location under Docker (see
# app/core/storage.py); outside Docker it defaults to a data/ folder at the
# project root. On Kubernetes /app/uploads must be a PersistentVolume (or swapped
# for object storage via APP_STORAGE_URL) or files vanish with the pod and
# are invisible to the other replicas.
ENV APP_DATA_DIR=/app/uploads
RUN useradd --create-home --uid 10001 grid \
 && mkdir -p /app/uploads \
 && chown -R grid:grid /app
USER grid

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# No --reload: one worker per container, scale with replicas.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

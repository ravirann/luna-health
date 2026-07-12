# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Luna AI — pipecat bot container.
#
# Two-stage build keeps the runtime image small. Build stage compiles native
# wheels (asyncpg, av, etc.); runtime image only ships the venv.
# ---------------------------------------------------------------------------

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv

# Build deps: gcc/g++/make for native wheels, libsndfile for soundfile,
# pkg-config + libffi for cffi-based packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      pkg-config \
      libffi-dev \
      libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---------------------------------------------------------------------------

FROM python:3.12-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/your-org/luna"
LABEL org.opencontainers.image.description="Luna Pipecat voice bot"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PORT=7860

# Runtime deps: ffmpeg for av (used by aiortc); libsndfile for soundfile.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libsndfile1 \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY bot.py ./
COPY luna_bot ./luna_bot

# Pipecat runner CLI defaults: bind 0.0.0.0:7860, transport=webrtc.
EXPOSE 7860

# Use exec form so SIGTERM from Fly reaches the python process for graceful
# shutdown of in-flight calls.
CMD ["python", "bot.py", "-t", "webrtc", "--host", "0.0.0.0", "--port", "7860"]

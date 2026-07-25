FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Install backend deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir aiohttp

# Copy backend
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

# Build frontend
RUN cd /app/frontend && npm install && npx vite build

WORKDIR /app/backend
ENV PORT=8082
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV PYTHONPATH=/app/backend

EXPOSE 8082

CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8082"]

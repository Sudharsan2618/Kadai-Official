#!/usr/bin/env bash
# Build and deploy the Kadai API to Cloud Run.
#
#   PROJECT_ID=my-project REGION=asia-south1 ./deploy/deploy.sh
#
# Run it from backend/. Assumes `gcloud auth login` and that the secrets in
# SECRETS below already exist in Secret Manager (see README).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-kadai-api}"
REPO="${REPO:-kadai}"                       # Artifact Registry repository
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)}"

# Non-secret configuration. Everything else comes from Secret Manager.
ENV_VARS="APP_ENV=production"
ENV_VARS="${ENV_VARS},JSON_LOGS=true"
ENV_VARS="${ENV_VARS},WA_MODE=${WA_MODE:-cloud}"
ENV_VARS="${ENV_VARS},DB_SCHEMA=${DB_SCHEMA:-kadai}"
ENV_VARS="${ENV_VARS},RUN_MIGRATIONS=true"
ENV_VARS="${ENV_VARS},SEED_DEMO_DATA=false"
ENV_VARS="${ENV_VARS},CORS_ORIGINS=${CORS_ORIGINS:?set CORS_ORIGINS to the frontend origin}"
ENV_VARS="${ENV_VARS},FRONTEND_URL=${FRONTEND_URL:?set FRONTEND_URL}"
ENV_VARS="${ENV_VARS},META_APP_ID=${META_APP_ID:-}"
ENV_VARS="${ENV_VARS},META_ES_CONFIG_ID=${META_ES_CONFIG_ID:-}"
ENV_VARS="${ENV_VARS},RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID:-}"

# Cloud SQL over the unix socket, or a plain TCP host (Render/Supabase/…).
CLOUDSQL_FLAG=()
if [[ -n "${CLOUD_SQL_INSTANCE:-}" ]]; then
  CLOUDSQL_FLAG=(--add-cloudsql-instances "${CLOUD_SQL_INSTANCE}")
  ENV_VARS="${ENV_VARS},CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE}"
else
  ENV_VARS="${ENV_VARS},DB_HOST=${DB_HOST:?set DB_HOST or CLOUD_SQL_INSTANCE}"
  ENV_VARS="${ENV_VARS},DB_PORT=${DB_PORT:-5432}"
fi
ENV_VARS="${ENV_VARS},DB_NAME=${DB_NAME:-kadai}"
ENV_VARS="${ENV_VARS},DB_USER=${DB_USER:-kadai}"

# secret-name:version pairs, mounted as env vars of the same name.
SECRETS="DB_PASSWORD=kadai-db-password:latest"
SECRETS="${SECRETS},JWT_SECRET=kadai-jwt-secret:latest"
SECRETS="${SECRETS},META_APP_SECRET=kadai-meta-app-secret:latest"
SECRETS="${SECRETS},WA_VERIFY_TOKEN=kadai-wa-verify-token:latest"
SECRETS="${SECRETS},WA_TOKEN_ENC_KEY=kadai-wa-token-enc-key:latest"
SECRETS="${SECRETS},RAZORPAY_KEY_SECRET=kadai-razorpay-key-secret:latest"
SECRETS="${SECRETS},RAZORPAY_WEBHOOK_SECRET=kadai-razorpay-webhook-secret:latest"

echo "→ building ${IMAGE}:${TAG}"
gcloud builds submit --project "${PROJECT_ID}" --tag "${IMAGE}:${TAG}" .

echo "→ deploying ${SERVICE} to ${REGION}"
# --no-cpu-throttling: paced broadcasts and SSE keepalives run BETWEEN requests.
#   Without it Cloud Run freezes the container after each response and a
#   broadcast stalls mid-send.
# --min/--max-instances 1: the SSE broker and in-flight broadcast state are
#   in-process. To go wider, move both to Pub/Sub/Redis first.
# --timeout 3600: /events is a long-lived stream.
gcloud run deploy "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${IMAGE}:${TAG}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --no-cpu-throttling \
  --min-instances 1 --max-instances 1 \
  --session-affinity \
  --timeout 3600 \
  --set-env-vars "^;^${ENV_VARS//,/;}" \
  --set-secrets "${SECRETS}" \
  "${CLOUDSQL_FLAG[@]}"

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
echo "→ deployed: ${URL}"
echo "  health:   ${URL}/health"
echo "  webhook:  ${URL}/wa/webhook   (register this in the Meta app)"

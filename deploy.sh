#!/usr/bin/env bash
# Zero-downtime deploy to Google Cloud Run (template — replace PROJECT/REGION).
# Prerequisites (one time):
#   gcloud auth login
#   gcloud config set project YOUR_GCP_PROJECT
#   Secrets in Secret Manager: CRM_POSTGRES_PROD_URL, CRM_REDIS_PROD_URL,
#     CRM_JWT_PRIVATE_KEY_B64, CRM_JWT_PUBLIC_KEY_B64, CRM_DATA_ENCRYPTION_KEY_B64,
#     CRM_RESEND_API_KEY (create with: printf 'value' | gcloud secrets create NAME --data-file=-)
set -euo pipefail

PROJECT="${GCP_PROJECT:-YOUR_GCP_PROJECT}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="crm-backend-service"
IMAGE="gcr.io/${PROJECT}/${SERVICE}:latest"

echo "==> Building container"
gcloud builds submit --tag "${IMAGE}" .

echo "==> Applying Prisma migrations (Cloud SQL via connector or direct URL)"
echo "    Ensure DATABASE_URL is reachable from this machine or run migrate as a Job."
# npx prisma migrate deploy  # uncomment when DATABASE_URL is exported locally

echo "==> Deploying to Cloud Run (traffic migrates only on healthy /health)"
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --no-allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,PORT=8080,TRUST_PROXY=1,CORS_ORIGINS=https://www.netamps.com,MAIL_FROM_NAME=Netamps Portal,MAIL_FROM_EMAIL=no-reply@netamps.in" \
  --set-secrets="DATABASE_URL=CRM_POSTGRES_PROD_URL:latest,REDIS_URL=CRM_REDIS_PROD_URL:latest,JWT_PRIVATE_KEY_B64=CRM_JWT_PRIVATE_KEY_B64:latest,JWT_PUBLIC_KEY_B64=CRM_JWT_PUBLIC_KEY_B64:latest,DATA_ENCRYPTION_KEY_B64=CRM_DATA_ENCRYPTION_KEY_B64:latest,RESEND_API_KEY=CRM_RESEND_API_KEY:latest" \
  --memory 1024Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 20 \
  --timeout 60 \
  --health-check-path /health

echo "==> Verifying"
SERVICE_URL="$(gcloud run services describe "${SERVICE}" --platform managed --region "${REGION}" --format 'value(status.url)')"
curl -fsS "${SERVICE_URL}/health"
echo "LIVE: ${SERVICE_URL}"

#!/bin/bash
# SentinL Production Deployment Script
# Optimized for high-throughput scaling and minimal instance provisioning

PROJECT_ID="gen-lang-client-0467323567"
REGION="asia-south1"
SERVICE_NAME="sentinl-bot"

# Preflight Check for required environment variables
ENV_VARS=("DISCORD_CLIENT_ID" "DISCORD_PUBLIC_KEY" "PRIMARY_AI_MODEL" "PREMIUM_AI_MODEL" "FIREBASE_PROJECT_ID" "FIREBASE_CLIENT_EMAIL" "FIRESTORE_DATABASE_ID" "RAZORPAY_KEY_ID" "APP_URL" "ADMIN_EMAIL" "TWITCH_CLIENT_ID")
MISSING_VARS=0
for var in "${ENV_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: Required environment variable $var is missing."
    MISSING_VARS=1
  fi
done

if [ $MISSING_VARS -eq 1 ]; then
  echo "Please ensure all required environment variables are set locally."
  exit 1
fi

# Preflight Check for required Google Secret Manager secrets
SECRETS=("DISCORD_BOT_TOKEN" "DISCORD_CLIENT_SECRET" "GROQ_API_KEY" "FIREBASE_PRIVATE_KEY" "RAZORPAY_KEY_SECRET" "RAZORPAY_WEBHOOK_SECRET" "YOUTUBE_API_KEY" "TWITCH_CLIENT_SECRET")
MISSING_SECRETS=0
for secret in "${SECRETS[@]}"; do
  if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "ERROR: Required Google Secret Manager secret '$secret' is missing or inaccessible."
    MISSING_SECRETS=1
  fi
done

if [ $MISSING_SECRETS -eq 1 ]; then
  echo "Please ensure all required secrets are created and populated in Google Secret Manager."
  exit 1
fi

echo "Deploying to Cloud Run with Concurrency Tuning..."
# Note: --concurrency 250 allows a single container to process up to 250 concurrent requests.
# This severely reduces the number of containers required to boot up simultaneously during high-traffic 
# events, significantly driving down the aggregate compute hours billed.
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --concurrency 250 \
  --cpu 2 \
  --memory 1Gi \
  --min-instances 1 \
  --max-instances 1 \
  --set-env-vars="DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID},DISCORD_PUBLIC_KEY=${DISCORD_PUBLIC_KEY},PRIMARY_AI_MODEL=${PRIMARY_AI_MODEL},PREMIUM_AI_MODEL=${PREMIUM_AI_MODEL},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID},RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID},APP_URL=${APP_URL},ADMIN_EMAIL=${ADMIN_EMAIL},TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID}" \
  --set-secrets="DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN:latest,DISCORD_CLIENT_SECRET=DISCORD_CLIENT_SECRET:latest,GROQ_API_KEY=GROQ_API_KEY:latest,FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET:latest,YOUTUBE_API_KEY=YOUTUBE_API_KEY:latest,TWITCH_CLIENT_SECRET=TWITCH_CLIENT_SECRET:latest"

echo "Deployment complete! Concurrency explicitly set to 250."

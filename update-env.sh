#!/bin/bash

# Script to update environment variables for existing Cloud Run service
# Usage: ./update-env.sh

set -e

echo "🔧 Updating environment variables for Cloud Run service..."

# Sett prosjektet
gcloud config set project smoringauto

# Sjekk at environment variables er satt
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] || [ -z "$OPENAI_API_KEY" ] || [ -z "$QUOTE_API_URL" ] || [ -z "$QUOTE_API_TOKEN" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: Environment variables not set!"
  echo ""
  echo "Please export the following environment variables:"
  echo "  export NEXT_PUBLIC_SUPABASE_URL=..."
  echo "  export NEXT_PUBLIC_SUPABASE_ANON_KEY=..."
  echo "  export OPENAI_API_KEY=..."
  echo "  export QUOTE_API_URL=..."
  echo "  export QUOTE_API_TOKEN=..."
  echo "  export SUPABASE_SERVICE_ROLE_KEY=..."
  echo ""
  echo "Or load them from .env.local:"
  echo "  source <(grep -v '^#' .env.local | sed 's/^/export /')"
  exit 1
fi

# Oppdater environment variables
echo "📦 Updating environment variables..."
gcloud run services update leafilms-pitch \
  --region europe-west1 \
  --update-env-vars="NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY,OPENAI_API_KEY=$OPENAI_API_KEY,QUOTE_API_URL=$QUOTE_API_URL,QUOTE_API_TOKEN=$QUOTE_API_TOKEN,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"

echo ""
echo "✅ Environment variables updated!"
echo ""
echo "Service URL:"
gcloud run services describe leafilms-pitch --region europe-west1 --format='value(status.url)'


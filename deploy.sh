#!/bin/bash

# Deployment script for Leafilms Pitch to Google Cloud Run
# Project: smoringauto

set -e

echo "🚀 Deploying Leafilms Pitch to Google Cloud Run..."

# Sett prosjektet
gcloud config set project smoringauto

# Sjekk om servicen allerede eksisterer
SERVICE_EXISTS=$(gcloud run services describe leafilms-pitch --region europe-north1 --format='value(metadata.name)' 2>/dev/null || echo "")

if [ -n "$SERVICE_EXISTS" ]; then
  echo "✅ Service already exists with environment variables configured"
  echo "📦 Building and deploying to existing Cloud Run service..."
  
  # Get environment variables from existing service for build
  ENV_OUTPUT=$(gcloud run services describe leafilms-pitch --region europe-north1 --format='get(spec.template.spec.containers[0].env)' 2>/dev/null)
  
  # Extract NEXT_PUBLIC_* variables for build (using Python for better parsing)
  SUPABASE_URL=$(python3 -c "
import sys
import re
env_str = sys.stdin.read()
match = re.search(r\"'name': 'NEXT_PUBLIC_SUPABASE_URL'.*?'value': '([^']+)'\", env_str)
print(match.group(1) if match else '')
" <<< "$ENV_OUTPUT")
  
  SUPABASE_KEY=$(python3 -c "
import sys
import re
env_str = sys.stdin.read()
match = re.search(r\"'name': 'NEXT_PUBLIC_SUPABASE_ANON_KEY'.*?'value': '([^']+)'\", env_str)
print(match.group(1) if match else '')
" <<< "$ENV_OUTPUT")
  
  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "⚠️  Warning: Could not extract build env vars from service"
    echo "   Using hardcoded values from cloudbuild.yaml"
    SUPABASE_URL="https://fmwcrgfxmlgfnsinnuyy.supabase.co"
    SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd2NyZ2Z4bWxnZm5zaW5udXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAxMjAsImV4cCI6MjA3ODE3NjEyMH0.6Q7wEUtSfOnCJ4OHWA1VT0ma0ya7DjcZQxCqPWMCMnE"
  fi
  
  # Deploy using Cloud Build with substitutions
  gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=_NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL",_NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_KEY" \
    --region=europe-north1
  
  # Deploy the built image to Cloud Run
  gcloud run deploy leafilms-pitch \
    --image gcr.io/smoringauto/leafilms-pitch:latest \
    --region europe-north1 \
    --platform managed \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --max-instances 10
else
  # Ny service - trenger environment variables
  if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] || [ -z "$OPENAI_API_KEY" ] || [ -z "$QUOTE_API_URL" ] || [ -z "$QUOTE_API_TOKEN" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Environment variables not set!"
    echo ""
    echo "Please set the following environment variables:"
    echo "  - NEXT_PUBLIC_SUPABASE_URL"
    echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
    echo "  - OPENAI_API_KEY"
    echo "  - QUOTE_API_URL"
    echo "  - QUOTE_API_TOKEN"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    exit 1
  fi
  
  echo "📦 Building and deploying new Cloud Run service..."
  gcloud run deploy leafilms-pitch \
    --source . \
    --region europe-north1 \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY,OPENAI_API_KEY=$OPENAI_API_KEY,QUOTE_API_URL=$QUOTE_API_URL,QUOTE_API_TOKEN=$QUOTE_API_TOKEN,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --max-instances 10
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "To get the service URL, run:"
echo "  gcloud run services describe leafilms-pitch --region europe-north1 --format='value(status.url)'"



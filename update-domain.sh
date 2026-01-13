#!/bin/bash

# Script for å oppdatere domenet på Leafilms Pitch
# Usage: ./update-domain.sh https://ditt-nye-domene.no

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Du må oppgi nytt domene som argument"
  echo ""
  echo "Usage:"
  echo "  ./update-domain.sh https://app.leafilms.no"
  echo ""
  exit 1
fi

NEW_DOMAIN="$1"

# Valider at det er en gyldig URL
if [[ ! $NEW_DOMAIN =~ ^https?:// ]]; then
  echo "❌ Error: Domene må starte med http:// eller https://"
  echo "   Eksempel: https://app.leafilms.no"
  exit 1
fi

echo "🔄 Oppdaterer domene til: $NEW_DOMAIN"
echo ""

# Sett prosjektet
gcloud config set project smoringauto

# Hent eksisterende environment variables
echo "📥 Henter eksisterende environment variables..."
ENV_OUTPUT=$(gcloud run services describe leafilms-pitch --region europe-north1 --format='get(spec.template.spec.containers[0].env)' 2>/dev/null || echo "")

if [ -z "$ENV_OUTPUT" ]; then
  echo "❌ Error: Kunne ikke hente eksisterende environment variables"
  echo "   Sjekk at servicen 'leafilms-pitch' eksisterer i region 'europe-north1'"
  exit 1
fi

# Extract eksisterende variabler (bruk Python for bedre parsing)
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

OPENAI_KEY=$(python3 -c "
import sys
import re
env_str = sys.stdin.read()
match = re.search(r\"'name': 'OPENAI_API_KEY'.*?'value': '([^']+)'\", env_str)
print(match.group(1) if match else '')
" <<< "$ENV_OUTPUT")

QUOTE_API_URL=$(python3 -c "
import sys
import re
env_str = sys.stdin.read()
match = re.search(r\"'name': 'QUOTE_API_URL'.*?'value': '([^']+)'\", env_str)
print(match.group(1) if match else '')
" <<< "$ENV_OUTPUT")

QUOTE_API_TOKEN=$(python3 -c "
import sys
import re
env_str = sys.stdin.read()
match = re.search(r\"'name': 'QUOTE_API_TOKEN'.*?'value': '([^']+)'\", env_str)
print(match.group(1) if match else '')
" <<< "$ENV_OUTPUT")

SERVICE_ROLE_KEY=$(python3 -c "
import sys
import re
env_str = sys.stdin.read()
match = re.search(r\"'name': 'SUPABASE_SERVICE_ROLE_KEY'.*?'value': '([^']+)'\", env_str)
print(match.group(1) if match else '')
" <<< "$ENV_OUTPUT")

# Bygg environment variables string
ENV_VARS="NEXT_PUBLIC_SITE_URL=$NEW_DOMAIN"

if [ -n "$SUPABASE_URL" ]; then
  ENV_VARS="$ENV_VARS,NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
fi

if [ -n "$SUPABASE_KEY" ]; then
  ENV_VARS="$ENV_VARS,NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_KEY"
fi

if [ -n "$OPENAI_KEY" ]; then
  ENV_VARS="$ENV_VARS,OPENAI_API_KEY=$OPENAI_KEY"
fi

if [ -n "$QUOTE_API_URL" ]; then
  ENV_VARS="$ENV_VARS,QUOTE_API_URL=$QUOTE_API_URL"
fi

if [ -n "$QUOTE_API_TOKEN" ]; then
  ENV_VARS="$ENV_VARS,QUOTE_API_TOKEN=$QUOTE_API_TOKEN"
fi

if [ -n "$SERVICE_ROLE_KEY" ]; then
  ENV_VARS="$ENV_VARS,SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
fi

echo "📤 Oppdaterer Cloud Run service..."
gcloud run services update leafilms-pitch \
  --region europe-north1 \
  --update-env-vars "$ENV_VARS"

echo ""
echo "✅ Domene oppdatert i Cloud Run!"
echo ""
echo "⚠️  VIKTIG: Du må også:"
echo ""
echo "1. Sett opp custom domain mapping i Google Cloud Console:"
echo "   - Gå til Cloud Run → leafilms-pitch → Manage Custom Domains"
echo "   - Legg til ditt nye domene"
echo "   - Følg instruksjonene for DNS setup"
echo ""
echo "2. Oppdater Supabase Redirect URLs:"
echo "   - Gå til Supabase Dashboard → Authentication → URL Configuration"
echo "   - Legg til: $NEW_DOMAIN/auth/callback"
echo "   - Legg til: $NEW_DOMAIN/auth/accept-invitation"
echo "   - Legg til: $NEW_DOMAIN/login"
echo "   - Oppdater Site URL til: $NEW_DOMAIN"
echo ""
echo "3. Sett opp DNS records i ditt domene-register"
echo ""
echo "📖 Se DOMAIN_CHANGE_GUIDE.md for detaljert informasjon"

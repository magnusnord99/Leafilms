#!/bin/bash
# Setter RESEND_API_KEY lokalt (.env.local) og i Cloud Run (produksjon).
# Kjør denne selv i din egen terminal — nøkkelen skrives aldri til chatten,
# og Claude ser aldri verdien.

set -e

read -s -p "Lim inn Resend API-nøkkel (re_...): " RESEND_KEY
echo ""

if [ -z "$RESEND_KEY" ]; then
  echo "Ingen nøkkel oppgitt — avbryter."
  exit 1
fi

ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Fant ikke $ENV_FILE — kjør dette scriptet fra repo-roten."
  exit 1
fi

if grep -q "^RESEND_API_KEY=" "$ENV_FILE"; then
  sed -i '' "s|^RESEND_API_KEY=.*|RESEND_API_KEY=$RESEND_KEY|" "$ENV_FILE"
else
  echo "RESEND_API_KEY=$RESEND_KEY" >> "$ENV_FILE"
fi
echo "✅ Satt i $ENV_FILE (lokal utvikling)"

gcloud run services update leafilms-pitch --region europe-north1 \
  --update-env-vars "RESEND_API_KEY=$RESEND_KEY"
echo "✅ Satt i Cloud Run (produksjon)"

echo ""
echo "Ferdig. Neste steg: sjekk at domenet leafilms.no er verifisert i Resend"
echo "(Domains-siden skal vise en grønn hake), test deretter å sende en ekte"
echo "e-post fra /admin/projects/[id]/email."

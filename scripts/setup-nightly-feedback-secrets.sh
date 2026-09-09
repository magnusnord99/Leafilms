#!/bin/bash
# Setter GitHub Actions-secrets for .github/workflows/nightly-feedback.yml
# fra verdiene som allerede finnes i .env.local. Kjør denne selv i din egen
# terminal — Claude skriver aldri API-nøkler/tokens inn noe sted selv.
#
# GCP_SA_KEY er IKKE i .env.local og settes ikke av dette scriptet — se
# instruksjonene scriptet skriver ut på slutten for hvordan du oppretter den.

set -e

ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Fant ikke $ENV_FILE — kjør dette scriptet fra repo-roten."
  exit 1
fi

get_value() {
  grep "^$1=" "$ENV_FILE" | head -1 | cut -d '=' -f2-
}

set_secret() {
  local name="$1"
  local value
  value=$(get_value "$name")
  if [ -z "$value" ]; then
    echo "⚠️  $name mangler i $ENV_FILE — hoppet over."
    return
  fi
  echo "$value" | gh secret set "$name"
  echo "✅ $name satt"
}

echo "Setter GitHub-secrets fra $ENV_FILE ..."
echo ""

set_secret "ANTHROPIC_API_KEY"
set_secret "NEXT_PUBLIC_SUPABASE_URL"
set_secret "NEXT_PUBLIC_SUPABASE_ANON_KEY"
set_secret "SUPABASE_SERVICE_ROLE_KEY"
set_secret "OPENAI_API_KEY"
set_secret "QUOTE_API_URL"
set_secret "QUOTE_API_TOKEN"

echo ""
echo "Gjenstår: GCP_SA_KEY (deploy-tilgang) — ikke i .env.local, må opprettes:"
echo ""
echo "  gcloud iam service-accounts create leafilms-nightly-deploy \\"
echo "    --project=smoringauto --display-name='Nightly feedback triage deploy'"
echo ""
echo "  for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/iam.serviceAccountUser; do"
echo "    gcloud projects add-iam-policy-binding smoringauto \\"
echo "      --member='serviceAccount:leafilms-nightly-deploy@smoringauto.iam.gserviceaccount.com' \\"
echo "      --role=\"\$ROLE\""
echo "  done"
echo ""
echo "  gcloud iam service-accounts keys create /tmp/leafilms-nightly-key.json \\"
echo "    --iam-account=leafilms-nightly-deploy@smoringauto.iam.gserviceaccount.com"
echo ""
echo "  gh secret set GCP_SA_KEY < /tmp/leafilms-nightly-key.json"
echo "  rm /tmp/leafilms-nightly-key.json"
echo ""
echo "Når GCP_SA_KEY også er satt: gh workflow run nightly-feedback.yml"
echo "for å teste kjøringen manuelt før den går live kl. 02:13."

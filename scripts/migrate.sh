#!/bin/bash

# Migration script for Supabase
# Supports both Supabase CLI and direct psql connection

set -e

MIGRATIONS_DIR="database-migrations"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🔄 Running database migrations..."
echo ""

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo -e "${RED}❌ Migrations directory not found: $MIGRATIONS_DIR${NC}"
  exit 1
fi

# Load .env.local if DATABASE_URL not already set
if [ -z "$DATABASE_URL" ] && [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | grep DATABASE_URL | xargs)
fi

# Method 1: psql with DATABASE_URL (preferred — avoids Supabase CLI migration conflicts)
if [ ! -z "$DATABASE_URL" ]; then
  echo -e "${GREEN}✓${NC} DATABASE_URL found"

  # Prefer Node.js runner (works without psql installed)
  if command -v npx &> /dev/null; then
    echo "📦 Running migrations with Node.js..."
    echo ""
    npx tsx scripts/migrate-node.ts
    exit $?
  fi

  # Fallback to psql if available
  if command -v psql &> /dev/null; then
    echo "📦 Running migrations with psql..."
    echo ""
    for file in $(ls $MIGRATIONS_DIR/*.sql | sort -V); do
      filename=$(basename "$file")
      echo "🔄 Running $filename..."
      psql "$DATABASE_URL" -f "$file" -q
      if [ $? -ne 0 ]; then
        echo -e "   ${RED}❌${NC} $filename failed"
        exit 1
      fi
      echo -e "   ${GREEN}✅${NC} $filename completed"
    done
    echo -e "${GREEN}✨ All migrations completed successfully!${NC}"
    exit 0
  fi

  echo -e "${RED}❌ Verken npx eller psql er installert${NC}"
  exit 1
fi

# Method 2: No method available - show instructions
echo -e "${RED}❌ No migration method available${NC}"
echo ""
echo "Add DATABASE_URL to .env.local:"
echo "  DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
echo "  (Finn tilkoblingsstrengen i Supabase Dashboard > Settings > Database)"
echo ""
echo "Eller kjør SQL manuelt:"
echo "  npm run migrate:show"
exit 1


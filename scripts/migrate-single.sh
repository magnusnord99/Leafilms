#!/bin/bash

# Run a single migration file
# Usage: ./scripts/migrate-single.sh database-migrations/016_auth_setup.sql

set -e

if [ -z "$1" ]; then
  echo "❌ Usage: ./scripts/migrate-single.sh <migration-file>"
  echo "   Example: ./scripts/migrate-single.sh database-migrations/016_auth_setup.sql"
  exit 1
fi

MIGRATION_FILE="$1"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ File not found: $MIGRATION_FILE"
  exit 1
fi

echo "🔄 Running migration: $MIGRATION_FILE"
echo ""

# Try psql with DATABASE_URL
if [ ! -z "$DATABASE_URL" ]; then
  echo "✓ Using DATABASE_URL"
  psql "$DATABASE_URL" -f "$MIGRATION_FILE"
  if [ $? -eq 0 ]; then
    echo ""
    echo "✨ Migration completed successfully!"
    exit 0
  else
    echo ""
    echo "❌ Migration failed"
    exit 1
  fi
fi

# Fallback: show SQL for manual copy
echo "⚠️  DATABASE_URL not set"
echo ""
echo "Please either:"
echo "1. Set DATABASE_URL in .env.local, or"
echo "2. Copy the SQL below to Supabase Dashboard > SQL Editor"
echo ""
echo "────────────────────────────────────────────────────────────────────────────────"
cat "$MIGRATION_FILE"
echo "────────────────────────────────────────────────────────────────────────────────"
exit 1


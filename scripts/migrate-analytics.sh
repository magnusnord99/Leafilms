#!/bin/bash

# Run only the analytics migration
# This can be run directly in Supabase SQL Editor if needed

MIGRATION_FILE="supabase/migrations/018_project_analytics.sql"

echo "🔄 Running analytics migration..."
echo ""

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

# Try Supabase CLI first
if command -v supabase &> /dev/null || npx supabase --version &> /dev/null 2>&1; then
  echo "📦 Using Supabase CLI..."
  echo ""
  echo "To run this migration, you can either:"
  echo ""
  echo "Option 1: Run in Supabase SQL Editor (Recommended)"
  echo "  1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql"
  echo "  2. Copy the contents of: $MIGRATION_FILE"
  echo "  3. Paste and run in SQL Editor"
  echo ""
  echo "Option 2: Use Supabase CLI (if project is linked)"
  echo "  npx supabase db push --include-all"
  echo ""
  echo "The migration file is located at:"
  echo "  $MIGRATION_FILE"
  echo ""
  echo "Contents:"
  echo "---"
  cat "$MIGRATION_FILE"
  echo "---"
else
  echo "❌ Supabase CLI not found"
  echo ""
  echo "Please run this migration manually in Supabase SQL Editor:"
  echo "  1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql"
  echo "  2. Copy the contents of: $MIGRATION_FILE"
  echo "  3. Paste and run"
fi


#!/bin/bash

# Script for å kjøre migrations med psql
# Bruk: ./scripts/run-migrations-psql.sh

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable not set"
  echo ""
  echo "💡 Set it in your .env.local file:"
  echo "   DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
  echo ""
  echo "   You can find the connection string in:"
  echo "   Supabase Dashboard > Settings > Database > Connection string"
  exit 1
fi

MIGRATIONS_DIR="database-migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

echo "📦 Running migrations from $MIGRATIONS_DIR"
echo ""

# Sorter filer etter nummer
for file in $(ls $MIGRATIONS_DIR/*.sql | sort -V); do
  filename=$(basename "$file")
  echo "🔄 Running $filename..."
  psql "$DATABASE_URL" -f "$file"
  
  if [ $? -eq 0 ]; then
    echo "   ✅ $filename completed"
  else
    echo "   ❌ $filename failed"
    exit 1
  fi
  echo ""
done

echo "✨ All migrations completed!"


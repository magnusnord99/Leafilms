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

# Method 1: Try Supabase CLI (recommended)
if command -v supabase &> /dev/null || npx supabase --version &> /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Supabase CLI found"
  
  # Check if project is linked
  if [ -f "supabase/.temp/project-ref" ] || [ -f ".supabase/config.toml" ]; then
    echo "📦 Using Supabase CLI to push migrations..."
    echo ""
    
    # Supabase CLI requires migrations in supabase/migrations/
    # Create symlink or copy if needed
    if [ ! -d "supabase/migrations" ]; then
      mkdir -p supabase/migrations
      echo "📁 Created supabase/migrations directory"
    fi
    
    # Copy migration files to supabase/migrations (Supabase CLI format)
    for file in $(ls $MIGRATIONS_DIR/*.sql | sort -V); do
      filename=$(basename "$file")
      # Supabase CLI expects timestamp prefix, but we'll use our numbering
      cp "$file" "supabase/migrations/$filename"
    done
    
    # Run migrations
    npx supabase db push
    
    if [ $? -eq 0 ]; then
      echo ""
      echo -e "${GREEN}✨ All migrations completed successfully!${NC}"
      exit 0
    else
      echo -e "${RED}❌ Migration failed${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠️  Supabase project not linked${NC}"
    echo "   Run: npx supabase link --project-ref YOUR_PROJECT_REF"
    echo ""
  fi
fi

# Method 2: Try psql with DATABASE_URL
if [ ! -z "$DATABASE_URL" ]; then
  echo -e "${GREEN}✓${NC} DATABASE_URL found"
  echo "📦 Running migrations with psql..."
  echo ""
  
  # Sort files by number
  for file in $(ls $MIGRATIONS_DIR/*.sql | sort -V); do
    filename=$(basename "$file")
    echo "🔄 Running $filename..."
    
    psql "$DATABASE_URL" -f "$file" -q
    
    if [ $? -eq 0 ]; then
      echo -e "   ${GREEN}✅${NC} $filename completed"
    else
      echo -e "   ${RED}❌${NC} $filename failed"
      exit 1
    fi
    echo ""
  done
  
  echo -e "${GREEN}✨ All migrations completed successfully!${NC}"
  exit 0
fi

# Method 3: No method available - show instructions
echo -e "${RED}❌ No migration method available${NC}"
echo ""
echo "Please set up one of the following:"
echo ""
echo "Option 1: Supabase CLI (Recommended)"
echo "  1. Link project: npx supabase link --project-ref YOUR_PROJECT_REF"
echo "     (Find project ref in Supabase Dashboard > Settings > General)"
echo "  2. Run: npm run migrate"
echo ""
echo "Option 2: Direct database connection"
echo "  1. Get connection string from:"
echo "     Supabase Dashboard > Settings > Database > Connection string"
echo "  2. Add to .env.local:"
echo "     DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
echo "  3. Run: npm run migrate"
echo ""
echo "Option 3: Manual (copy SQL to Supabase Dashboard)"
echo "  Run: npm run migrate:show"
echo "  (Shows all SQL files to copy manually)"
exit 1


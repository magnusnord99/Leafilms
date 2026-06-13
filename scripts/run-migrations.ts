import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL in environment variables')
  process.exit(1)
}

async function runMigrations() {
  try {
    const migrationsDir = join(process.cwd(), 'database-migrations')
    const files = await readdir(migrationsDir)
    
    // Filtrer og sorter SQL-filer etter nummer
    const sqlFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/^\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/^\d+/)?.[0] || '0')
        return numA - numB
      })

    console.log(`📦 Found ${sqlFiles.length} migration files\n`)

    if (!supabaseServiceKey) {
      console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY not found.')
      console.log('📋 Showing SQL files to run manually:\n')
      
      for (const file of sqlFiles) {
        const filePath = join(migrationsDir, file)
        const sql = await readFile(filePath, 'utf-8')
        console.log(`📄 ${file}:`)
        console.log('─'.repeat(60))
        console.log(sql)
        console.log('─'.repeat(60))
        console.log('')
      }
      
      console.log('💡 To run automatically, add SUPABASE_SERVICE_ROLE_KEY to .env.local')
      console.log('   Find it in: Supabase Dashboard > Settings > API > service_role key')
      return
    }

    // Prøv å kjøre via Supabase REST API
    console.log('🔄 Attempting to run migrations via Supabase API...\n')
    
    for (const file of sqlFiles) {
      const filePath = join(migrationsDir, file)
      const sql = await readFile(filePath, 'utf-8')
      
      console.log(`🔄 Processing ${file}...`)
      
      // Supabase støtter ikke direkte SQL execution via REST API for DDL
      // Vi må bruke en annen metode
      // Den beste løsningen er å bruke Supabase CLI eller psql
      
      console.log(`   ⚠️  Cannot execute DDL automatically via API`)
      console.log(`   📋 Copy SQL below to Supabase SQL Editor:\n`)
      console.log('─'.repeat(60))
      console.log(sql)
      console.log('─'.repeat(60))
      console.log('')
    }

    console.log('💡 Recommended: Use Supabase CLI for automatic migrations:')
    console.log('   1. Link: npx supabase link --project-ref YOUR_PROJECT_REF')
    console.log('   2. Run: npx supabase db push')
    console.log('')
    console.log('   (No installation needed - npx downloads it automatically)')
    console.log('\n   Or use psql with DATABASE_URL:')
    console.log('   psql $DATABASE_URL -f database-migrations/XXX_file.sql')
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

runMigrations()

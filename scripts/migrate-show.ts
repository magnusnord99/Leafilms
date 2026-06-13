import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

async function showMigrations() {
  try {
    const migrationsDir = join(process.cwd(), 'database-migrations')
    const files = await readdir(migrationsDir)
    
    // Filter and sort SQL files by number
    const sqlFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/^\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/^\d+/)?.[0] || '0')
        return numA - numB
      })

    console.log(`📦 Found ${sqlFiles.length} migration files\n`)
    console.log('─'.repeat(80))
    console.log('')

    for (const file of sqlFiles) {
      const filePath = join(migrationsDir, file)
      const sql = await readFile(filePath, 'utf-8')
      
      console.log(`📄 ${file}`)
      console.log('─'.repeat(80))
      console.log(sql)
      console.log('─'.repeat(80))
      console.log('')
    }
    
    console.log('💡 Copy the SQL above to Supabase Dashboard > SQL Editor')
    console.log('   Or set up automatic migrations with: npm run migrate')
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

showMigrations()


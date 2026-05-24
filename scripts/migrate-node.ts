import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { Client } from 'pg'

async function loadEnv() {
  try {
    const envFile = await readFile(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...rest] = trimmed.split('=')
      if (key && rest.length > 0 && !process.env[key]) {
        process.env[key] = rest.join('=').replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // .env.local not found, use existing env
  }
}

async function runMigrations() {
  await loadEnv()

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL ikke satt i .env.local')
    process.exit(1)
  }

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const migrationsDir = join(process.cwd(), 'database-migrations')
  const files = (await readdir(migrationsDir))
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^\d+/)?.[0] || '0')
      const numB = parseInt(b.match(/^\d+/)?.[0] || '0')
      return numA - numB
    })

  console.log(`📦 Fant ${files.length} migrasjonsfiler\n`)

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf-8')
    process.stdout.write(`🔄 ${file}... `)
    try {
      await client.query(sql)
      console.log('✅')
      ok++
    } catch (err: any) {
      // Skip "already exists" errors — idempotent re-runs
      if (
        err.code === '42P07' || // relation already exists
        err.code === '42710' || // object already exists
        err.code === '42701' || // column already exists
        err.message?.includes('already exists')
      ) {
        console.log('⏭  (allerede kjørt)')
        skipped++
      } else {
        console.log(`❌ FEIL: ${err.message}`)
        failed++
        // Continue with remaining migrations
      }
    }
  }

  await client.end()

  console.log(`\n✨ Ferdig: ${ok} kjørt, ${skipped} hoppet over, ${failed} feilet`)
  if (failed > 0) process.exit(1)
}

runMigrations().catch(err => {
  console.error('❌ Uventet feil:', err.message)
  process.exit(1)
})

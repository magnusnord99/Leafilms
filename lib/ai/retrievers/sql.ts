import { createServiceClient } from '@/lib/supabase-server'
import type { Retriever } from './index'

export const sqlRetriever: Retriever = {
  name: 'query_database',
  description:
    'Kjør en SELECT-spørring mot Leafilms-databasen for å hente data om prosjekter, kunder, leads, oppgaver og team.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL SELECT-spørring mot databasen',
      },
    },
    required: ['sql'],
  },
  async execute(input) {
    const { sql } = input as { sql: string }

    if (!/^\s*SELECT\s/i.test(sql.trim())) {
      return { error: 'Kun SELECT-spørringer er tillatt' }
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query: sql,
    })

    if (error) return { error: error.message }
    return { rows: data ?? [], count: Array.isArray(data) ? data.length : 0 }
  },
}

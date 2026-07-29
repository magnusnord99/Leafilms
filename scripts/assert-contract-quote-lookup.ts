/**
 * Låser inn at kontraktsoperasjoner (signering / PDF) resolver tilbud via
 * contracts.quote_id — ikke is_current — når begge finnes.
 *
 * Kjør: npx tsx scripts/assert-contract-quote-lookup.ts
 */
import { resolveContractQuoteLookup, pickBestQuote } from '../lib/quote-builder-utils'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

// Signering med fryst quote_id på kontrakten — skal IKKE følge is_current-kladden
{
  const lookup = resolveContractQuoteLookup('quote-v1-frozen', 'proj-1')
  assert(lookup.mode === 'by_id' && lookup.quoteId === 'quote-v1-frozen',
    'published contract must resolve quote by contract.quote_id')
}

// Legacy uten quote_id — fallback til is_current for prosjektet
{
  const lookup = resolveContractQuoteLookup(null, 'proj-1')
  assert(lookup.mode === 'fallback_current' && lookup.projectId === 'proj-1',
    'null quote_id falls back to is_current lookup')
  const empty = resolveContractQuoteLookup(undefined, 'proj-2')
  assert(empty.mode === 'fallback_current' && empty.projectId === 'proj-2',
    'undefined quote_id falls back to is_current lookup')
}

// pickBestQuote: akseptert V1 vinner over is_current-kladde V2 (display-siden av samme bug)
{
  const v1 = { id: 'v1', status: 'accepted', is_current: false, created_at: '2026-01-01T00:00:00Z' }
  const v2 = { id: 'v2', status: 'draft', is_current: true, created_at: '2026-07-01T00:00:00Z' }
  const best = pickBestQuote([v1, v2])
  assert(best?.id === 'v1', 'accepted quote wins over newer is_current draft')
}

console.log('assert-contract-quote-lookup: all passed')

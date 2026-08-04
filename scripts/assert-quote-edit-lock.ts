/**
 * Låser inn at tilbuds-editoren:
 * 1) åpner is_current (ikke akseptert V1) når en nyere kladd finnes
 * 2) behandler accepted/rejected som låst for innholdsendring
 *
 * pickBestQuote forblir akseptert-først for display (hub/økonomi).
 *
 * Kjør: npx tsx scripts/assert-quote-edit-lock.ts
 */
import {
  pickBestQuote,
  pickQuoteForEditing,
  isQuoteContentLocked,
} from '../lib/quote-builder-utils'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

const v1 = { id: 'v1', status: 'accepted', is_current: false, created_at: '2026-01-01T00:00:00Z' }
const v2 = { id: 'v2', status: 'draft', is_current: true, created_at: '2026-07-01T00:00:00Z' }

{
  const best = pickBestQuote([v1, v2])
  assert(best?.id === 'v1', 'display: accepted V1 still wins over is_current draft')
}

{
  const editable = pickQuoteForEditing([v1, v2])
  assert(editable?.id === 'v2', 'editor: opens is_current draft, not accepted V1')
}

{
  const onlyAccepted = {
    id: 'v1',
    status: 'accepted',
    is_current: true,
    created_at: '2026-01-01T00:00:00Z',
  }
  const editable = pickQuoteForEditing([onlyAccepted])
  assert(editable?.id === 'v1', 'editor: sole accepted+current quote still opens')
}

{
  const drafts = [
    { id: 'a', status: 'draft', is_current: false, created_at: '2026-01-01T00:00:00Z' },
    { id: 'b', status: 'sent', is_current: true, created_at: '2026-02-01T00:00:00Z' },
  ]
  assert(pickQuoteForEditing(drafts)?.id === 'b', 'editor: prefers is_current among drafts')
  assert(pickBestQuote(drafts)?.id === 'b', 'display: falls back to is_current when none accepted')
}

assert(isQuoteContentLocked('accepted'), 'accepted content is locked')
assert(isQuoteContentLocked('rejected'), 'rejected content is locked')
assert(!isQuoteContentLocked('draft'), 'draft content is not locked')
assert(!isQuoteContentLocked('sent'), 'sent content is not locked')
assert(!isQuoteContentLocked(null), 'null status is not locked')

console.log('assert-quote-edit-lock: all passed')

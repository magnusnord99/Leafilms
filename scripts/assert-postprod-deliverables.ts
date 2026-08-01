/**
 * Assertions for signed-deliverables / multi-video post-prod correctness helpers.
 * Run: npx tsx scripts/assert-postprod-deliverables.ts
 */
import {
  resolveActiveVideoDeliverableId,
  countsTowardStageAdvance,
} from '../lib/postprod-flow'

let failed = 0

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('OK:', msg)
  }
}

// resolveActiveVideoDeliverableId
assert(resolveActiveVideoDeliverableId([], null) === null, '0 videos → null')
assert(resolveActiveVideoDeliverableId([{ id: 'a' }], null) === null, '1 video → null (no tabs)')
assert(resolveActiveVideoDeliverableId([{ id: 'a' }, { id: 'b' }], null) === 'a', '2+ videos, null current → first')
assert(resolveActiveVideoDeliverableId([{ id: 'a' }, { id: 'b' }], 'b') === 'b', '2+ videos, valid current kept')
assert(resolveActiveVideoDeliverableId([{ id: 'a' }, { id: 'b' }], 'gone') === 'a', '2+ videos, stale current → first')

// countsTowardStageAdvance — orphans must not block advance
const active = new Set(['v1', 'v2'])
assert(countsTowardStageAdvance({ deliverable_id: null }, active), 'shared (null) counts')
assert(countsTowardStageAdvance({ deliverable_id: 'v1' }, active), 'active deliverable counts')
assert(!countsTowardStageAdvance({ deliverable_id: 'removed' }, active), 'orphan deliverable does not count')
assert(
  [{ deliverable_id: null, status: 'done' }, { deliverable_id: 'removed', status: 'todo' }, { deliverable_id: 'v1', status: 'done' }]
    .filter(t => countsTowardStageAdvance(t, active))
    .every(t => t.status === 'done'),
  'all relevant done even with incomplete orphan → can advance'
)

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll assertions passed')

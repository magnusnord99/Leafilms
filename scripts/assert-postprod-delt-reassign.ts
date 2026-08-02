/**
 * Asserts that intentional Delt moves are not force-reassigned on board reload.
 * Run: npx tsx scripts/assert-postprod-delt-reassign.ts
 */
import { findFlatLaneTasksToReassign } from '../lib/postprod-video-seed'

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('OK:', msg)
  }
}

const titles = new Set(['Grovklipp', 'Klipp', 'Farger', 'Lyd', 'Venter på tilbakemelding'])
const deliverableIds = new Set(['vid-1', 'vid-2'])

// 1→2+ transition: flat lane still has null deliverable_id, no tabs scoped yet
{
  const ids = findFlatLaneTasksToReassign(
    [
      { id: 'a', title: 'Logging', deliverable_id: null },
      { id: 'b', title: 'Klipp', deliverable_id: null },
      { id: 'c', title: 'Ferdig', deliverable_id: null },
    ],
    titles,
    deliverableIds
  )
  assert(ids.length === 1 && ids[0] === 'b', '1→2+ reassigns only per_deliverable flat titles')
}

// After tabs exist: intentional Delt move of Klipp must stick
{
  const ids = findFlatLaneTasksToReassign(
    [
      { id: 'shared-log', title: 'Logging', deliverable_id: null },
      { id: 'moved-klipp', title: 'Klipp', deliverable_id: null }, // intentional Delt
      { id: 'v1-grov', title: 'Grovklipp', deliverable_id: 'vid-1' },
      { id: 'v2-klipp', title: 'Klipp', deliverable_id: 'vid-2' },
    ],
    titles,
    deliverableIds
  )
  assert(ids.length === 0, 'intentional Delt move is not reassigned when tabs already scoped')
}

// Orphan deliverable_id from a removed video must not count as "scoped"
{
  const ids = findFlatLaneTasksToReassign(
    [
      { id: 'b', title: 'Klipp', deliverable_id: null },
      { id: 'orphan', title: 'Klipp', deliverable_id: 'old-vid' },
    ],
    titles,
    deliverableIds
  )
  assert(ids.length === 1 && ids[0] === 'b', 'orphan foreign deliverable_id does not block 1→2+ reassign')
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll assertions passed')

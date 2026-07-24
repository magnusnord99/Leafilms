/**
 * Lightweight assertions for post-prod sequence helpers.
 * Run: npx tsx scripts/assert-postprod-flow.ts
 */
import {
  isOffSequencePostProdTask,
  isReseedDeletableTemplate,
  isSequentialPostProdStep,
  reorderExistingIds,
} from '../lib/postprod-flow'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

// reorderExistingIds
assert(
  reorderExistingIds(['a', 'b', 'c'], 'c', 'a').join(',') === 'c,a,b',
  'reorder before a'
)
assert(
  reorderExistingIds(['a', 'b', 'c'], 'a', null).join(',') === 'b,c,a',
  'reorder to end'
)

// Off-sequence / reseed / stepper classification
assert(isOffSequencePostProdTask({ is_parallel: true, custom_lane_id: null }), 'parallel is off-sequence')
assert(isOffSequencePostProdTask({ is_parallel: false, custom_lane_id: 'lane-1' }), 'custom lane is off-sequence')
assert(!isOffSequencePostProdTask({ is_parallel: false, custom_lane_id: null }), 'default lane is on-sequence')

assert(
  isReseedDeletableTemplate({ created_by: null, is_parallel: false, custom_lane_id: null }),
  'plain template is deletable on reseed'
)
assert(
  !isReseedDeletableTemplate({ created_by: null, is_parallel: true, custom_lane_id: null }),
  'moved-to-parallel template must NOT be deletable on reseed'
)
assert(
  !isReseedDeletableTemplate({ created_by: null, is_parallel: false, custom_lane_id: 'x' }),
  'moved-to-custom template must NOT be deletable on reseed'
)
assert(
  !isReseedDeletableTemplate({ created_by: 'user-1', is_parallel: false, custom_lane_id: null }),
  'human-created default-lane step is preserved'
)

assert(
  isSequentialPostProdStep({ is_custom: false, is_parallel: false, custom_lane_id: null }),
  'default template step is sequential'
)
assert(
  !isSequentialPostProdStep({ is_custom: false, is_parallel: true, custom_lane_id: null }),
  'parallel must not enter stepper'
)
assert(
  !isSequentialPostProdStep({ is_custom: false, is_parallel: false, custom_lane_id: 'x' }),
  'custom lane must not enter stepper'
)
assert(
  !isSequentialPostProdStep({ is_custom: true, is_parallel: false, custom_lane_id: null }),
  'is_custom must not enter stepper'
)

console.log('assert-postprod-flow: all passed')

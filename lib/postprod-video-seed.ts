/**
 * Pure helpers for multi-video post-prod seeding.
 * Kept free of server/Supabase imports so assert scripts can exercise them.
 *
 * Spec: docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §3
 * Acceptance: drag a per-deliverable card into Delt, reload — it must stay in Delt.
 */

export type SeedableVideoTask = {
  id: string
  title: string
  deliverable_id: string | null
}

/**
 * Task IDs that should be one-shot reassigned from the old flat video lane
 * onto the first deliverable during a 1→2+ transition.
 *
 * Once any current video deliverable already has scoped tasks, a
 * per_deliverable title with deliverable_id=NULL is an intentional Delt move
 * and must NOT be rewritten.
 */
export function findFlatLaneTasksToReassign(
  existingVideoTasks: SeedableVideoTask[],
  perDeliverableTitles: Set<string>,
  videoDeliverableIds: Set<string>
): string[] {
  const hasScopedTasks = existingVideoTasks.some(
    t => t.deliverable_id != null && videoDeliverableIds.has(t.deliverable_id)
  )
  if (hasScopedTasks) return []

  return existingVideoTasks
    .filter(t => t.deliverable_id === null && perDeliverableTitles.has(t.title))
    .map(t => t.id)
}

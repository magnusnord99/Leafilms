// lib/postprod-flow.ts
//
// Ren sekvenslogikk for å sette et nytt, menneske-lagt post_prod-steg inn i
// den låste stepperen (f.eks. et VFX/animasjon-steg lagt til fra pre-prod),
// og for å flette bevarte menneske-steg inn igjen etter en reseed av
// maloppgavene. Ingen DB-kall her — kalles fra lib/actions/pipeline.ts.

export type FlowOrigin = 'existing' | 'template' | 'new'

export type SequenceRow = {
  /** null for rader som ikke er lagret i DB ennå (mal-fallback eller det nye steget) */
  id: string | null
  title: string
  description: string | null
  origin: FlowOrigin
}

/**
 * Setter newStep inn i currentSequence rett før raden med tittel
 * insertBeforeTitle. Hvis insertBeforeTitle er null, eller ikke finnes i
 * sekvensen, settes newStep sist.
 */
export function computeInsertionOrder(
  currentSequence: SequenceRow[],
  newStep: SequenceRow,
  insertBeforeTitle: string | null
): SequenceRow[] {
  const insertAt = insertBeforeTitle === null
    ? currentSequence.length
    : (() => {
        const idx = currentSequence.findIndex(row => row.title === insertBeforeTitle)
        return idx === -1 ? currentSequence.length : idx
      })()

  return [
    ...currentSequence.slice(0, insertAt),
    newStep,
    ...currentSequence.slice(insertAt),
  ]
}

/**
 * Slår sammen ferske maloppgaver (etter en reseed) med bevarte
 * menneske-lagde rader. De bevarte radene legges bakerst — ved
 * prosjekttype-bytte finnes det ingen pålitelig måte å gjenskape nøyaktig
 * gammel interlevning på, siden gamle ankerpunkter (mal-titler) kan ha
 * forsvunnet.
 */
export function mergeReseededSequence(
  freshTemplates: SequenceRow[],
  preserved: SequenceRow[]
): SequenceRow[] {
  return [...freshTemplates, ...preserved]
}

/** Renummererer en sekvens til fortløpende sort_order (1..N). */
export function assignSortOrder(
  sequence: SequenceRow[]
): (SequenceRow & { sortOrder: number })[] {
  return sequence.map((row, i) => ({ ...row, sortOrder: i + 1 }))
}

/**
 * Flytter subjectId til rett før raden med id beforeId i en liste av
 * eksisterende, allerede lagrede id-er (i motsetning til
 * computeInsertionOrder, som setter inn en ny, ulagret rad). Hvis beforeId
 * er null, eller ikke finnes i listen, havner subjectId sist.
 */
export function reorderExistingIds(
  ids: string[],
  subjectId: string,
  beforeId: string | null
): string[] {
  const rest = ids.filter(id => id !== subjectId)
  const insertAt = beforeId === null
    ? rest.length
    : (() => {
        const idx = rest.indexOf(beforeId)
        return idx === -1 ? rest.length : idx
      })()

  return [...rest.slice(0, insertAt), subjectId, ...rest.slice(insertAt)]
}

/** Oppgaver i parallell-rad eller egendefinert lane — utenfor den låste sekvensen. */
export function isOffSequencePostProdTask(t: {
  is_parallel?: boolean | null
  custom_lane_id?: string | null
}): boolean {
  return !!t.is_parallel || t.custom_lane_id != null
}

/**
 * Maloppgaver som Nullstill/reseed skal slette. Parallell/egendefinerte lanes
 * er alltid utenfor mal-sekvensen — også hvis created_by fortsatt er null
 * (f.eks. etter drag uten å claim'e eierskap).
 */
export function isReseedDeletableTemplate(t: {
  created_by: string | null
  is_parallel?: boolean | null
  custom_lane_id?: string | null
}): boolean {
  return t.created_by === null && !isOffSequencePostProdTask(t)
}

/** Steg som deltar i den låste post-prod-stepperen (ikke custom/parallell/egendefinert). */
export function isSequentialPostProdStep(t: {
  is_custom: boolean
  is_parallel?: boolean | null
  custom_lane_id?: string | null
}): boolean {
  return !t.is_custom && !isOffSequencePostProdTask(t)
}

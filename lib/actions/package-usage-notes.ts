'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import { PackageUsageNote, QuotePackageShowcaseKind } from '@/lib/types'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { DEFAULT_PACKAGE_USAGE_NOTES } from '@/lib/package-usage-notes'

// Faste 4 rader (samme kind-sett som quote_package_showcase_items.kind), delt
// globalt på tvers av alle flyers — se 198_package_usage_notes.sql.
export async function getPackageUsageNotes(): Promise<PackageUsageNote[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('package_usage_notes').select('kind, label, note')
  if (error) {
    console.error('getPackageUsageNotes:', error)
    return DEFAULT_PACKAGE_USAGE_NOTES
  }
  const notes = (data ?? []) as PackageUsageNote[]
  return DEFAULT_PACKAGE_USAGE_NOTES.map(fallback => notes.find(note => note.kind === fallback.kind) ?? fallback)
}

// Kun UPDATE — radene finnes allerede fra migrasjonens seed, ingen ny kind
// kan legges til via denne (settet er fast, se CHECK-constraint).
export async function updatePackageUsageNote(
  kind: QuotePackageShowcaseKind,
  label: string,
  note: string
): Promise<{ data: PackageUsageNote } | { error: string }> {
  const auth = await getAuthenticatedStaffUser()
  if (!auth.ok) return { error: 'Du har ikke tilgang til å endre teksten' }
  if (!DEFAULT_PACKAGE_USAGE_NOTES.some(item => item.kind === kind)
    || typeof label !== 'string' || typeof note !== 'string'
    || !label.trim() || label.trim().length > 80 || !note.trim() || note.trim().length > 2000) {
    return { error: 'Fyll inn overskrift (maks 80 tegn) og beskrivelse (maks 2000 tegn)' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('package_usage_notes')
    .update({ label: label.trim(), note: note.trim(), updated_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq('kind', kind)
    .select('kind, label, note')
    .single()
  if (error || !data) {
    console.error('updatePackageUsageNote:', error)
    return { error: 'Kunne ikke lagre teksten' }
  }
  return { data: data as PackageUsageNote }
}

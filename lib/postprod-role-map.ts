import type { PostProdTaskLite } from '@/lib/actions/preprod'

// Kobler pre-prod post_crew-rolle til task_assignees på faktiske post-prod-oppgaver.
// Delt mellom syncPostCrewToTask (server action i lib/actions/preprod.ts) og
// resolvePostProdTaskForRole under — flyttet ut av preprod.ts fordi den filen har
// 'use server' og resolvePostProdTaskForRole er en ren, synkron oppslagsfunksjon
// (Next.js krever at ALLE eksporter fra en 'use server'-fil er async-funksjoner).
export const ROLE_TASK_MAP: Record<string, string[]> = {
  video_logging:             ['Logging'],
  video_grovklipp:           ['Grovklipp'],
  video_klipp:               ['Klipp'],
  video_farger:              ['Farger'],
  video_lyd:                 ['Lyd'],
  video_ferdig:              ['Ferdig'],
  photo_selektering:         ['Selektering', 'Selektering bilder'],
  photo_redigering:          ['Redigering', 'Redigering bilder'],
  photo_ferdig:              ['Ferdig'],
}

// Finner post-prod-oppgaven en Fordeling-rad tilsvarer, matchet på tittel + sub_type
// (video/foto kan begge ha en oppgave som heter "Ferdig" i mixed-prosjekter).
export function resolvePostProdTaskForRole(
  roleKey: string,
  tasks: PostProdTaskLite[]
): PostProdTaskLite | null {
  const titles = ROLE_TASK_MAP[roleKey]
  if (!titles?.length) return null
  const subType = roleKey.startsWith('video_') ? 'video' : roleKey.startsWith('photo_') ? 'photo' : null
  return tasks.find(t => titles.includes(t.title) && t.sub_type === subType) ?? null
}

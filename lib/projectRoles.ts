/**
 * Forhåndsdefinerte roller for team-medlemmer i prosjekter.
 * Rollen man velger bestemmer teksten som vises på baksiden av kortet.
 */
export const PROJECT_ROLES = [
  { id: 'videograf', label: 'Videograf', description: 'Håndterer kamera og videoopptak gjennom hele produksjonen.' },
  { id: 'dop', label: 'DOP (Director of Photography)', description: 'Ansvar for det visuelle uttrykket, lyssetting og kameraarbeid.' },
  { id: 'fotograf', label: 'Fotograf', description: 'Tar statiske bilder og stillbilder under produksjonen.' },
  { id: 'director', label: 'Director', description: 'Har det overordnede kunstneriske ansvaret for prosjektet.' },
  { id: 'produsent', label: 'Produsent', description: 'Koordinerer produksjonen, budsjett og ressurser.' },
  { id: 'redaktor', label: 'Redaktør', description: 'Redigerer og monterer video til sluttprodukt.' },
  { id: 'lydskaper', label: 'Lydskaper', description: 'Lydopptak, lyddesign og postproduksjon av lyd.' },
  { id: 'gaffer', label: 'Gaffer', description: 'Ansvar for lysrigging og belysning på settet.' },
  { id: 'fargekorrigerer', label: 'Fargekorrigering', description: 'Fargekorrigering og fargegrading i postproduksjon.' },
  { id: 'drone', label: 'Dronepilot', description: 'Flyr drone for luftopptak og aeriale shots.' }
] as const

export type ProjectRoleId = typeof PROJECT_ROLES[number]['id']

export function getRoleDescription(roleIdOrText: string | null): string | null {
  if (!roleIdOrText) return null
  const role = PROJECT_ROLES.find(r => r.id === roleIdOrText)
  if (role) return role.description
  // Tilbakekompatibilitet: hvis lagret verdi ikke matcher noen rolle, vis den som fri tekst
  return roleIdOrText
}

/** Returnerer samlet beskrivelse for flere roller (f.eks. "Desc1. Desc2.") */
export function getRoleDescriptions(roleIdsOrText: string[] | string | null): string | null {
  if (!roleIdsOrText) return null
  const ids = Array.isArray(roleIdsOrText) ? roleIdsOrText : [roleIdsOrText]
  if (ids.length === 0) return null
  const descriptions = ids
    .map(id => getRoleDescription(id))
    .filter((d): d is string => !!d)
  if (descriptions.length === 0) return null
  return descriptions.join(' ')
}

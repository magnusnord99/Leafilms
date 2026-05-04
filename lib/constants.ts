/**
 * Faste roller som kan velges for team-medlemmer i et prosjekt.
 * Brukes som checkbokser på baksiden av team-kort.
 */
export const PROJECT_ROLES = [
  'Regissør',
  'Produsent',
  'Videograf',
  'Fotograf',
  'DOP',
  'Kameramann',
  'Droneoperatør',
  'Editor',
  'Lydtekniker',
  'Lysdesigner',
  'VFX',
  'Skuespiller',
  'Stylist',
  'Makeup',
] as const

export type ProjectRoleLabel = (typeof PROJECT_ROLES)[number]

/**
 * Mapping fra rolle til beskrivelse av hva personen gjør (brukes i setningsform).
 */
export const ROLE_ACTIONS: Record<string, string> = {
  Regissør: 'regissere',
  Produsent: 'produsere og koordinere produksjonen',
  Videograf: 'filme og videografering',
  Fotograf: 'fotografering',
  DOP: 'foto og bildekomposisjon',
  Kameramann: 'kameraarbeid',
  Droneoperatør: 'droneoperasjon',
  Editor: 'redigering og klipping',
  Lydtekniker: 'lyd og lydopptak',
  Lysdesigner: 'lysdesign',
  VFX: 'visuelle effekter og VFX',
  Skuespiller: 'skuespill',
  Stylist: 'styling',
  Makeup: 'makeup og sminke',
}

export const ROLE_ACTIONS_EN: Record<string, string> = {
  Regissør: 'directing',
  Produsent: 'producing and coordinating the production',
  Videograf: 'filming and videography',
  Fotograf: 'photography',
  DOP: 'cinematography and image composition',
  Kameramann: 'camera operation',
  Droneoperatør: 'drone operation',
  Editor: 'editing and cutting',
  Lydtekniker: 'sound and audio recording',
  Lysdesigner: 'lighting design',
  VFX: 'visual effects and VFX',
  Skuespiller: 'acting',
  Stylist: 'styling',
  Makeup: 'makeup and cosmetics',
}

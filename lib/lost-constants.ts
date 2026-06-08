export type LostReason =
  | 'pris'
  | 'konkurrent'
  | 'utsatt'
  | 'budsjett_kuttet'
  | 'intern'
  | 'ikke_svar'
  | 'annet'

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  pris:            'Pris for høy',
  konkurrent:      'Valgte konkurrent',
  utsatt:          'Prosjekt utsatt',
  budsjett_kuttet: 'Budsjett kuttet',
  intern:          'Intern produksjon',
  ikke_svar:       'Ikke svar',
  annet:           'Annet',
}

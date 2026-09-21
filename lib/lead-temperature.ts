// Delt kilde for lead-temperatur — farger og rekkefølge brukes både av
// TemperatureSlider (redigering) og lead-oversikten/-detaljsiden, så de tre
// alltid viser samme skala i stedet for hver sin kopi av samme fargekart.

import type { LeadTemperature } from './actions/leads'

export const LEAD_TEMPERATURE_ORDER: LeadTemperature[] = ['cold', 'lukewarm', 'warm']

export const LEAD_TEMPERATURE_CONFIG: Record<LeadTemperature, { label: string; color: string }> = {
  cold:     { label: 'Kald',   color: '#5B9BD5' },
  lukewarm: { label: 'Lunken', color: '#F0A500' },
  warm:     { label: 'Varm',   color: '#E05555' },
}

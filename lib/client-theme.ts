// Sentraliserte design-tokens for alle kundevendte sider (pitch, galleri, leveranser).
// Endre verdiene her for å oppdatere utseendet på tvers av alle kundesider.

export const S = {
  // Bakgrunner — warm near-black
  bg:          '#0C0B09',
  surface:     '#131210',
  surface2:    '#1A1916',
  surface3:    '#201D18',
  border:      '#2A2820',
  borderLight: '#38332A',

  // Gull-aksent — Leafilms signaturfarve
  gold:        '#C49434',
  goldHover:   '#D4A848',
  goldBg:      'rgba(196,148,52,0.08)',
  goldBgHover: 'rgba(196,148,52,0.14)',
  goldBorder:  'rgba(196,148,52,0.25)',

  // Tekst
  text:        '#E8E0D0',
  text2:       '#8A8070',
  text3:       '#5A5448',

  // Semantiske farger
  green:       '#4CAF7D',
  greenBg:     'rgba(76,175,125,0.10)',
  warning:     '#D4863A',
  warningBg:   'rgba(212,134,58,0.10)',
  danger:      '#B84040',
  dangerBg:    'rgba(184,64,64,0.10)',
  info:        '#4878B8',
  infoBg:      'rgba(72,120,184,0.10)',

  // Typografi
  fontDisplay: 'var(--font-cormorant, Georgia, serif)',
  fontBody:    'var(--font-dm-sans, system-ui, sans-serif)',

  // Radii
  radius:      '10px',
  radiusSm:    '6px',
  radiusLg:    '16px',
}

export type WebsiteMockSettings = {
  brand?: string
  domain?: string
  heroTitle?: string
  heroSubtitle?: string
  eyebrow?: string
  heading?: string
  body?: string
  buttonText?: string
  images?: string[]
  video?: string | null
}

export const WEBSITE_MOCK_DEFAULTS = {
  brand: 'leafilms', domain: 'leafilms.no',
  heroTitle: 'Opplevelser som blir med deg', heroSubtitle: 'Finn inspirasjon til ditt neste øyeblikk',
  eyebrow: 'Velkommen til oss', heading: 'Oppdag mulighetene',
  body: 'Bli kjent med oss og finn inspirasjon til nye opplevelser. Vi hjelper deg med å finne det som passer for deg.',
  buttonText: 'Kontakt oss',
} satisfies Required<Omit<WebsiteMockSettings, 'images' | 'video'>>

export function validWebsiteMock(value: unknown): value is WebsiteMockSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const url = (path: unknown) => typeof path === 'string' && path.length <= 2048 && /^https?:\/\//.test(path)
  return Object.entries(value).every(([key, item]) => {
    if (key === 'images') return Array.isArray(item) && item.length <= 2 && item.every(url)
    if (key === 'video') return item === null || url(item)
    return Object.hasOwn(WEBSITE_MOCK_DEFAULTS, key) && typeof item === 'string' && item.length <= 2000
  })
}

import type { PackageUsageNote } from '@/lib/types'

// Behold den eksisterende teksten hvis migrasjonen ikke er kjørt eller lesing feiler.
export const DEFAULT_PACKAGE_USAGE_NOTES: PackageUsageNote[] = [
  { kind: 'main_video', label: 'Hovedvideo', note: 'Klar til bruk på landingssiden eller forsiden av nettstedet ditt.' },
  { kind: 'social_clip', label: 'Klipp', note: 'Tilpasset sosiale medier — Instagram, TikTok og Stories.' },
  { kind: 'photo', label: 'Bilder', note: 'Fri bruk i nyhetsbrev, trykksaker og egne kanaler.' },
  { kind: 'website_photo', label: 'Nettside-bilder', note: 'Ferdig tilpasset til bruk direkte på nettsiden.' },
]

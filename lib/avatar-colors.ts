export const AVATAR_COLORS = [
  '#7C5CFC', // lilla (brand-aksent)
  '#9B6BD9', // orkide
  '#6B7EC4', // lavendel
  '#4A8FA8', // stålblå
  '#4A9AC4', // himmelblå
  '#50C8C8', // turkis
  '#4CAF7D', // grønn
  '#5C9E6B', // mosegrønn
  '#8FA84A', // oliven
  '#C49434', // gull
  '#E0A840', // rav
  '#E07B54', // terrakotta
  '#C4634A', // rust
  '#B85C8A', // rosa
  '#E8529A', // magenta
] as const

export type AvatarColor = typeof AVATAR_COLORS[number]

function hashFallback(id: string): AvatarColor {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/**
 * Returns a profile's chosen color, or a deterministic hash-based fallback
 * if they haven't picked one yet (profile.color is null/undefined).
 */
export function getAvatarColor(profile: { id: string; color?: string | null }): string {
  return profile.color ?? hashFallback(profile.id)
}

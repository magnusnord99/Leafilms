// Mention-parsing: first-name-only by default, case-insensitive, whole-word
// matching. When two teammates share a first name, mentionToken disambiguates
// by appending the last-name initial (or, if that still collides, the full
// last name) — see feedback c1588b30.

export type MentionableProfile = { id: string; name: string | null; email: string }

function nameParts(p: MentionableProfile): string[] {
  return (p.name?.trim() || p.email.split('@')[0]).split(' ').filter(Boolean)
}

export function mentionToken(profile: MentionableProfile, allProfiles: MentionableProfile[] = []): string {
  const parts = nameParts(profile)
  const firstName = parts[0] ?? ''
  const others = allProfiles.filter(p => p.id !== profile.id)

  const sharesFirstName = others.some(p => (nameParts(p)[0] ?? '').toLowerCase() === firstName.toLowerCase())
  if (!sharesFirstName) return firstName

  const lastInitial = parts[1]?.[0] ?? ''
  if (!lastInitial) return firstName
  const withInitial = firstName + lastInitial

  const sharesInitialToo = others.some(p => {
    const op = nameParts(p)
    return (op[0] ?? '').toLowerCase() === firstName.toLowerCase() && (op[1]?.[0] ?? '').toLowerCase() === lastInitial.toLowerCase()
  })
  return sharesInitialToo ? firstName + (parts[1] ?? '') : withInitial
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractMentionIds(text: string, profiles: MentionableProfile[]): string[] {
  const ids = new Set<string>()
  for (const profile of profiles) {
    const token = mentionToken(profile, profiles)
    if (!token) continue
    const pattern = new RegExp(`@${escapeRegExp(token)}(?![\\wæøåÆØÅ])`, 'i')
    if (pattern.test(text)) ids.add(profile.id)
  }
  return Array.from(ids)
}

export type MentionSegment = { text: string; isMention: boolean }

export function splitMentionSegments(
  text: string,
  resolvedMentionIds: string[],
  profiles: MentionableProfile[]
): MentionSegment[] {
  const resolvedProfiles = profiles.filter(p => resolvedMentionIds.includes(p.id))
  const tokens = resolvedProfiles.map(p => mentionToken(p, profiles)).filter(Boolean)

  if (tokens.length === 0) {
    return [{ text, isMention: false }]
  }

  const tokenPattern = tokens.map(escapeRegExp).join('|')
  const pattern = new RegExp(`@(?:${tokenPattern})(?![\\wæøåÆØÅ])`, 'gi')

  const segments: MentionSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), isMention: false })
    segments.push({ text: match[0], isMention: true })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isMention: false })
  return segments
}

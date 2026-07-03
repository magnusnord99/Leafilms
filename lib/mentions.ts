// Mention-parsing: first-name-only, case-insensitive, whole-word matching.
// Deliberate simplification for a small internal team — if two teammates
// share a first name, mentioning either name notifies both. Multi-word
// names are not supported as mention tokens.

export type MentionableProfile = { id: string; name: string | null; email: string }

export function mentionToken(profile: MentionableProfile): string {
  const base = profile.name?.trim() || profile.email.split('@')[0]
  return base.split(' ')[0]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractMentionIds(text: string, profiles: MentionableProfile[]): string[] {
  const ids = new Set<string>()
  for (const profile of profiles) {
    const token = mentionToken(profile)
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
  const tokens = resolvedProfiles.map(p => mentionToken(p)).filter(Boolean)

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

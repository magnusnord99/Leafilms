export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'I dag'
  if (days === 1) return 'I går'
  if (days < 7) return `${days} dager siden`
  if (days < 30) return `${Math.floor(days / 7)} uker siden`
  if (days < 365) return `${Math.floor(days / 30)} mnd siden`
  return `${Math.floor(days / 365)} år siden`
}

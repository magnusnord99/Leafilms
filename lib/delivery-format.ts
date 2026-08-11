// Leveringsinfo på et prosjekt er spredt over tre felt (historisk: delivery_description
// var opprinnelig det eneste feltet — migrasjon 050 splittet senere video/foto ut i egne
// felt, men uten å fjerne/erstatte delivery_description). Flere steder (kontrakt,
// board-infopanel) leste tidligere kun delivery_description og viste ingenting hvis
// admin bare hadde fylt ut video/foto-feltene. Denne kombinerer alle tre konsistent.
export function combinedDeliveryText(
  project: { delivery_description?: string | null; delivery_video?: string | null; delivery_photo?: string | null },
  language: 'no' | 'en' = 'no'
): string | null {
  const desc = project.delivery_description?.trim() || null
  const videoLabel = language === 'en' ? 'Video' : 'Video'
  const photoLabel = language === 'en' ? 'Photos' : 'Foto'
  const extras = [
    project.delivery_video?.trim() ? `${videoLabel}: ${project.delivery_video.trim()}` : null,
    project.delivery_photo?.trim() ? `${photoLabel}: ${project.delivery_photo.trim()}` : null,
  ].filter((x): x is string => !!x)

  if (desc && extras.length) return `${desc} (${extras.join(', ')})`
  if (desc) return desc
  if (extras.length) return extras.join(' · ')
  return null
}

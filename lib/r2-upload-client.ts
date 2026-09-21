// Klient-side hjelpefunksjon for å laste opp en fil til R2 som en multipart-
// opplasting, rett fra nettleseren (filbitene går aldri innom Next.js-serveren
// — nødvendig for filer i GB/TB-klassen). Brukes av både leveranser
// (TransferUploadClient) og postprod-filopplasting (TaskVideoFiles).
import { getUploadPartUrl } from '@/lib/actions/transfers'

export async function uploadFileToR2(
  file: File,
  key: string,
  uploadId: string,
  partSize: number,
  onProgress: (pct: number) => void
): Promise<{ ETag: string; PartNumber: number }[]> {
  const totalParts = Math.max(1, Math.ceil(file.size / partSize))
  const parts: { ETag: string; PartNumber: number }[] = new Array(totalParts)
  const uploadedPerPart = new Array(totalParts).fill(0)
  const CONCURRENCY = 4
  let nextIndex = 0

  const reportProgress = () => {
    const uploaded = uploadedPerPart.reduce((a, b) => a + b, 0)
    onProgress(Math.min(99, (uploaded / file.size) * 100))
  }

  const worker = async () => {
    while (nextIndex < totalParts) {
      const i = nextIndex++
      const partNumber = i + 1
      const start = i * partSize
      const end = Math.min(start + partSize, file.size)
      const blob = file.slice(start, end)

      const urlResult = await getUploadPartUrl({ key, uploadId, partNumber })
      if ('error' in urlResult) throw new Error(urlResult.error)

      const res = await fetch(urlResult.url, { method: 'PUT', body: blob })
      if (!res.ok) throw new Error(`Opplasting av del ${partNumber} feilet (${res.status})`)
      const etag = res.headers.get('ETag')
      if (!etag) {
        throw new Error('Mangler ETag i svaret fra R2 — CORS-policyen på bucketen må inkludere "ExposeHeaders": ["ETag"]')
      }

      parts[i] = { ETag: etag, PartNumber: partNumber }
      uploadedPerPart[i] = end - start
      reportProgress()
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalParts) }, worker))
  return parts
}

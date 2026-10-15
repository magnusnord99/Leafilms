// Klient-side hjelpefunksjoner for å laste opp til R2 som en multipart-
// opplasting, rett fra nettleseren (filbitene går aldri innom Next.js-serveren
// — nødvendig for filer i GB/TB-klassen). Brukes av leveranser, postprod-
// filopplasting og den delte delivery-upload-klienten.
import { getUploadPartUrl } from '@/lib/actions/transfers'

// Laster opp en ReadableStream<Uint8Array> til R2 som en multipart-opplasting.
// Brukes typisk for zip-streams fra client-zip der vi ikke kan slice fremover.
// Kjører sekvensielt (én del om gangen) — parallell opplasting er ikke mulig
// uten å bufre hele strømmen i minnet.
export async function uploadStreamToR2(
  stream: ReadableStream<Uint8Array>,
  key: string,
  uploadId: string,
  partSize: number,
  onProgress: (bytesUploaded: number, totalBytes: number) => void,
  estimatedTotal: number
): Promise<{ ETag: string; PartNumber: number }[]> {
  const reader = stream.getReader()
  const parts: { ETag: string; PartNumber: number }[] = []
  let partNumber = 1
  let bytesUploaded = 0

  // Akkumulert buffer av chunks som ennå ikke er sendt som én del
  let pending: Uint8Array[] = []
  let pendingSize = 0

  const sendPart = async (byteCount: number) => {
    const chunk = new Uint8Array(byteCount)
    let offset = 0
    let remaining = byteCount
    const leftover: Uint8Array[] = []

    for (const buf of pending) {
      if (remaining <= 0) {
        leftover.push(buf)
        continue
      }
      if (buf.length <= remaining) {
        chunk.set(buf, offset)
        offset += buf.length
        remaining -= buf.length
      } else {
        chunk.set(buf.subarray(0, remaining), offset)
        leftover.push(buf.subarray(remaining))
        remaining = 0
      }
    }

    pending = leftover
    pendingSize -= byteCount

    const urlResult = await getUploadPartUrl({ key, uploadId, partNumber })
    if ('error' in urlResult) throw new Error(urlResult.error)

    const res = await fetch(urlResult.url, { method: 'PUT', body: chunk })
    if (!res.ok) throw new Error(`Opplasting av del ${partNumber} feilet (${res.status})`)

    const etag = res.headers.get('ETag')
    if (!etag) {
      throw new Error('Mangler ETag i svaret fra R2 — CORS-policyen på bucketen må inkludere "ExposeHeaders": ["ETag"]')
    }

    parts.push({ ETag: etag, PartNumber: partNumber })
    bytesUploaded += byteCount
    onProgress(bytesUploaded, estimatedTotal)
    partNumber++
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    pending.push(value)
    pendingSize += value.length

    while (pendingSize >= partSize) {
      await sendPart(partSize)
    }
  }

  // Siste (og muligens eneste) del — kan være mindre enn partSize
  if (pendingSize > 0) {
    await sendPart(pendingSize)
  }

  return parts
}

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

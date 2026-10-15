// Delte klientside-hjelpere for leveranse-opplasting med drag-and-drop og
// zip-støtte. Importeres kun fra client components — bruker nettleser-APIer.
// Ingen 'use client'- eller 'use server'-direktiv (vanlig util-modul).
import { downloadZip, predictLength } from 'client-zip'
import { initiateUpload, completeUpload, abortUpload } from '@/lib/actions/transfers'
import { uploadFileToR2, uploadStreamToR2 } from '@/lib/r2-upload-client'

export type DroppedItem = { file: File; relativePath: string }

export type DeliveryUploadResult = {
  filename: string
  filesize: number
  r2Key: string
  contentType?: string
}

// ---------------------------------------------------------------------------
// Fil-innsamling via FileSystem Access API (drag-and-drop)
// ---------------------------------------------------------------------------

async function traverseEntry(
  entry: FileSystemEntry,
  results: DroppedItem[]
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) =>
      fileEntry.file(resolve, reject)
    )
    // fullPath starter alltid med '/' — fjern ledende slash
    results.push({ file, relativePath: entry.fullPath.replace(/^\//, '') })
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const entries: FileSystemEntry[] = []

    // VIKTIG: readEntries() returnerer maks ~100 entries per kall i Chrome/Safari.
    // Kall i løkke inntil vi får en tom batch — ellers mister vi filer i store mapper.
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      )
      if (batch.length === 0) break
      entries.push(...batch)
    }

    for (const child of entries) {
      await traverseEntry(child, results)
    }
  }
}

/**
 * Samler alle filer fra en DataTransfer (drag-and-drop) rekursivt.
 * Støtter enkeltfiler, mappetrær og blandinger.
 */
export async function collectDroppedEntries(
  dataTransfer: DataTransfer
): Promise<DroppedItem[]> {
  const results: DroppedItem[] = []
  const items = Array.from(dataTransfer.items)

  for (const item of items) {
    // Foretrekk FileSystem API for rekursiv mappe-traversering
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      await traverseEntry(entry, results)
    } else {
      // Fallback: hent som File (ingen mappe-traversering mulig)
      const file = item.getAsFile()
      if (file) results.push({ file, relativePath: file.name })
    }
  }

  return results
}

/**
 * Konverterer en vanlig FileList (fra <input type="file">) til DroppedItem[].
 * `webkitRelativePath` settes av nettleseren for mappeopplasting.
 */
export function collectPickedFiles(fileList: FileList): DroppedItem[] {
  return Array.from(fileList).map(file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }))
}

// ---------------------------------------------------------------------------
// Opplasting
// ---------------------------------------------------------------------------

/**
 * Laster opp én eller flere filer til R2.
 *
 * - Én fil  → lastes opp direkte (parallell multipart, originalt filnavn)
 * - Flere filer/mappe → streames til én zip via client-zip (STORE, ingen
 *   komprimering) og lastes opp som `${baseName}.zip`. Mappestrukturen
 *   bevares via relative stier inni zip-en.
 *
 * Kalles typisk fra DeliveryDropzone-foreldrekomponenten.
 */
export async function uploadDeliveryItems(
  items: DroppedItem[],
  baseName: string,
  onProgress: (bytesUploaded: number, totalBytes: number) => void
): Promise<DeliveryUploadResult> {
  if (items.length === 0) throw new Error('Ingen filer å laste opp')

  if (items.length === 1) {
    // --------------- Enkeltfil: last opp direkte, uendret filnavn ---------------
    const { file } = items[0]
    const totalBytes = file.size

    const initResult = await initiateUpload({
      filename: file.name,
      contentType: file.type || undefined,
    })
    if ('error' in initResult) throw new Error(initResult.error)

    const { key, uploadId, partSize } = initResult
    try {
      const parts = await uploadFileToR2(
        file, key, uploadId, partSize,
        (pct) => onProgress(Math.round((pct / 100) * totalBytes), totalBytes)
      )
      const completeResult = await completeUpload({ key, uploadId, parts })
      if ('error' in completeResult) throw new Error(completeResult.error)

      return {
        filename: file.name,
        filesize: file.size,
        r2Key: key,
        contentType: file.type || undefined,
      }
    } catch (err) {
      abortUpload({ key, uploadId }).catch(() => {})
      throw err
    }
  }

  // --------------- Flere filer: zip og last opp ---------------
  // client-zip bruker STORE (ingen komprimering) — størrelsen er forutsigbar
  const zipEntries = items.map(({ file, relativePath }) => ({
    name: relativePath,
    input: file,
    size: file.size,
  }))

  // predictLength() beregner nøyaktig total zip-størrelse synkront
  const totalBytes = Number(predictLength(zipEntries))

  const safeBase = baseName.replace(/[^\w\-æøåÆØÅ .]/g, '_').trim() || 'leveranse'
  const zipFilename = `${safeBase}.zip`

  const zipStream = downloadZip(zipEntries).body
  if (!zipStream) throw new Error('Nettleseren støtter ikke streaming-zip')

  const initResult = await initiateUpload({
    filename: zipFilename,
    contentType: 'application/zip',
  })
  if ('error' in initResult) throw new Error(initResult.error)

  const { key, uploadId, partSize } = initResult
  try {
    const parts = await uploadStreamToR2(
      zipStream, key, uploadId, partSize, onProgress, totalBytes
    )
    const completeResult = await completeUpload({ key, uploadId, parts })
    if ('error' in completeResult) throw new Error(completeResult.error)

    return {
      filename: zipFilename,
      filesize: totalBytes,
      r2Key: key,
      contentType: 'application/zip',
    }
  } catch (err) {
    abortUpload({ key, uploadId }).catch(() => {})
    throw err
  }
}

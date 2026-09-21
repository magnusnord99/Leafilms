import { S3Client } from '@aws-sdk/client-s3'

// Cloudflare R2 er S3-kompatibelt — samme SDK som AWS S3, bare egen endpoint.
// Krever R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
// (API-token opprettet under R2 > Manage API Tokens i Cloudflare-dashbordet).
// CORS: bucketens CORS-policy (R2 > bucket > Settings > CORS Policy i
// Cloudflare-dashbordet) må tillate GET (ikke bare PUT) fra admin-originene,
// ellers feiler nettleseren med "Failed to fetch" når den prøver å spille av
// en opplastet fil (f.eks. <video src=signertUrl>) — bekreftet 2026-09-21 at
// opplasting virket, men avspilling feilte, fordi GET manglet i policyen.
// Eksempel-regel: { "AllowedOrigins": [...], "AllowedMethods": ["GET","PUT","HEAD"],
// "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"] }
export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
})

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? ''

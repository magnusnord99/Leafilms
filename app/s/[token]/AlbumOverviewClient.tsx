'use client'

import { useRouter } from 'next/navigation'
import type { SelectionGallery, AlbumForCustomer, GalleryVideo } from '@/lib/actions/selections'
import { SELECTION_STRINGS, type SelectionLanguage, type SelectionStrings } from './strings'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  goldBg:  'rgba(196,148,52,0.08)',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

export default function AlbumOverviewClient({
  token,
  gallery,
  albums,
  videos = [],
  language = 'no',
}: {
  token: string
  gallery: SelectionGallery
  albums: AlbumForCustomer[]
  videos?: GalleryVideo[]
  language?: SelectionLanguage
}) {
  const t = SELECTION_STRINGS[language]
  const router = useRouter()
  const rootAlbums = albums.filter(a => a.parent_album_id === null)
  const totalSelected = albums.reduce((sum, a) => sum + a.selectedCount, 0)
  const target = gallery.target_count
  const isOver = target != null && totalSelected > target

  const counterColor = isOver ? S.warning : (target != null && totalSelected === target) ? S.green : S.text
  const counterLabel = t.selectedOf(totalSelected, target)

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: S.surface, borderBottom: `1px solid ${S.border}`,
        padding: '13px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>
          Leafilms
        </span>
        <span style={{ fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, color: counterColor }}>
          {counterLabel}
        </span>
      </div>

      {isOver && (
        <div style={{ background: 'rgba(212,134,58,0.12)', borderBottom: '1px solid rgba(212,134,58,0.3)', padding: '8px 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.78rem', color: S.warning }}>
            {t.overWarning(totalSelected, target!)}
          </p>
        </div>
      )}

      {/* Album-grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, maxWidth: 860, margin: '0 auto' }}>
          {rootAlbums.map(album => (
            <AlbumCard
              key={album.id}
              album={album}
              allAlbums={albums}
              t={t}
              onClick={() => router.push(`/s/${token}/${album.slug}`)}
            />
          ))}

          {videos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              t={t}
              onClick={() => router.push(`/s/${token}/video/${video.id}`)}
            />
          ))}

          {/* Se alle valgte-kort */}
          {totalSelected > 0 && (
            <div
              onClick={() => router.push(`/s/${token}/review`)}
              style={{
                borderRadius: 8, overflow: 'hidden', border: `1px solid rgba(196,148,52,0.3)`,
                cursor: 'pointer', background: S.goldBg,
              }}
            >
              <div style={{
                aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(196,148,52,0.05)',
              }}>
                <span style={{ fontSize: '2rem' }}>✓</span>
              </div>
              <div style={{ padding: '10px 12px', background: S.goldBg }}>
                <div style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', fontWeight: 600, color: S.gold }}>
                  {t.viewAllSelected(totalSelected)}
                </div>
                <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: S.text2, marginTop: 2 }}>
                  {t.reviewBeforeSubmit}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Send inn-knapp */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, background: S.surface, flexShrink: 0 }}>
        <button
          onClick={() => router.push(`/s/${token}/review`)}
          disabled={totalSelected === 0}
          style={{
            width: '100%', padding: '13px', borderRadius: 9, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
            cursor: totalSelected > 0 ? 'pointer' : 'not-allowed',
            background: totalSelected > 0 ? S.gold : S.surface2,
            color: totalSelected > 0 ? '#0C0B09' : S.text3,
            transition: 'background 0.15s',
          }}
        >
          {t.submitSelection(totalSelected)}
        </button>
      </div>
    </div>
  )
}

function countAlbumTree(albumId: string, allAlbums: AlbumForCustomer[]): { total: number; selected: number; cover: string | null } {
  const album = allAlbums.find(a => a.id === albumId)
  if (!album) return { total: 0, selected: 0, cover: null }

  let total = album.images.length
  let selected = album.selectedCount
  let cover = album.images[0]?.signedUrl ?? null

  for (const child of allAlbums.filter(a => a.parent_album_id === albumId)) {
    const sub = countAlbumTree(child.id, allAlbums)
    total += sub.total
    selected += sub.selected
    if (!cover && sub.cover) cover = sub.cover
  }

  return { total, selected, cover }
}

function VideoCard({ video, t, onClick }: { video: GalleryVideo; t: SelectionStrings; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${S.border}`, cursor: 'pointer' }}
    >
      <div style={{
        aspectRatio: '16/9', background: S.surface2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="13" stroke={S.text3} strokeWidth="1.5" />
          <polygon points="11,9 21,14 11,19" fill={S.gold} />
        </svg>
        {video.status === 'submitted' && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(196,148,52,0.9)', color: '#0C0B09',
            fontSize: '0.62rem', fontWeight: 700, fontFamily: 'sans-serif',
            padding: '2px 7px', borderRadius: 8,
          }}>
            {t.submittedBadge}
          </div>
        )}
        {video.comment_count > 0 && video.status !== 'submitted' && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(196,148,52,0.9)', color: '#0C0B09',
            fontSize: '0.62rem', fontWeight: 700, fontFamily: 'sans-serif',
            padding: '2px 7px', borderRadius: 8,
          }}>
            {t.commentCount(video.comment_count)}
          </div>
        )}
      </div>
      <div style={{ padding: '9px 11px', background: S.surface }}>
        <div style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', fontWeight: 600, color: S.text }}>
          {video.title}
        </div>
        <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: S.text2, marginTop: 2 }}>
          {t.videoLabel}
        </div>
      </div>
    </div>
  )
}

function AlbumCard({ album, allAlbums, t, onClick }: { album: AlbumForCustomer; allAlbums: AlbumForCustomer[]; t: SelectionStrings; onClick: () => void }) {
  const { total, selected, cover } = countAlbumTree(album.id, allAlbums)

  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2820', cursor: 'pointer' }}
    >
      <div style={{ aspectRatio: '16/9', background: '#1A1916', overflow: 'hidden', position: 'relative' }}>
        {cover ? (
          <img
            src={cover}
            alt={album.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#1A1916' }} />
        )}
        {selected > 0 && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(196,148,52,0.9)', color: '#0C0B09',
            fontSize: '0.62rem', fontWeight: 700, fontFamily: 'sans-serif',
            padding: '2px 7px', borderRadius: 8,
          }}>
            {t.selectedBadge(selected)}
          </div>
        )}
      </div>
      <div style={{ padding: '9px 11px', background: '#131210' }}>
        <div style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', fontWeight: 600, color: '#E8E0D0' }}>
          {album.name}
        </div>
        <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: '#8A8070', marginTop: 2 }}>
          {t.imageCount(total)}
        </div>
      </div>
    </div>
  )
}

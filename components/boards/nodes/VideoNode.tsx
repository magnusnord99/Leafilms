'use client'

import type { NodeProps } from '@xyflow/react'
import type { VideoContent } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function VideoNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P } = useBoardUi()
  const content = data.card.content as VideoContent
  return (
    <CardShell cardId={id} selected={!!selected} padding={6}>
      <div className="nodrag" style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 4, overflow: 'hidden', background: '#000' }}>
        {content.embed_url ? (
          <iframe
            src={content.embed_url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : content.url ? (
          <video src={content.url} controls style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: P.text2, fontSize: '0.75rem' }}>Ingen video</div>
        )}
      </div>
    </CardShell>
  )
}

'use client'

import type { NodeProps } from '@xyflow/react'
import type { LinkContent } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function LinkNode({ data, selected }: NodeProps<CardNode>) {
  const { palette: P } = useBoardUi()
  const content = data.card.content as LinkContent
  const host = (() => { try { return new URL(content.url).hostname } catch { return content.url } })()
  return (
    <CardShell selected={!!selected} padding={0}>
      <a href={content.url} target="_blank" rel="noopener noreferrer" className="nodrag" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        {content.image_url && (
          <img src={content.image_url} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: '7px 7px 0 0', display: 'block' }} draggable={false} />
        )}
        <div style={{ padding: 10 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: P.text, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {content.title ?? host}
          </div>
          {content.description && (
            <div style={{ fontSize: '0.7rem', color: P.text2, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {content.description}
            </div>
          )}
          <div style={{ fontSize: '0.66rem', color: P.accent }}>🔗 {host}</div>
        </div>
      </a>
    </CardShell>
  )
}

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
  // Forsvar i dybden: render aldri en klikkbar lenke med annet skjema enn http(s)
  // (f.eks. javascript: — kortene vises også på offentlige delingssider)
  const safeHref = /^https?:\/\//i.test(content.url) ? content.url : undefined
  const inner = (
    <>
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
    </>
  )
  return (
    <CardShell selected={!!selected} padding={0}>
      {safeHref ? (
        <a href={safeHref} target="_blank" rel="noopener noreferrer" className="nodrag" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          {inner}
        </a>
      ) : (
        <div className="nodrag" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          {inner}
        </div>
      )}
    </CardShell>
  )
}

'use client'

import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Edge, type OnNodeDrag, type OnBeforeDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { BoardCard, BoardCardContent, BoardCardType } from '@/lib/types'
import {
  createBoardCard, deleteBoardCards, deleteBoardEdges, saveCardPositions, fetchLinkMetadata, updateCardContent,
  type BoardData, type CardPositionPatch,
} from '@/lib/actions/boards'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, type BoardPalette } from './boardContext'
import { cardsToNodes, cardToNode, edgesToFlow, CARD_WIDTH, type CardNode } from './toFlow'
import { nodeTypes } from './nodes'
import Toolbar from './Toolbar'
import { uploadBoardFile } from './upload'
import { parseVideoEmbed } from './videoUrl'

const SAVE_ERROR_MSG = 'Kunne ikke lagre siste endring — sjekk nettverket og prøv igjen.'

const ENABLED_TYPES: BoardCardType[] = ['note', 'image', 'video', 'link', 'color', 'todo'] // utvides per task

function defaultContent(type: BoardCardType): BoardCardContent {
  switch (type) {
    case 'note': return { text: '' }
    case 'color': return { hex: '#C49434' }
    case 'todo': return { items: [] }
    case 'column': return { title: 'Kolonne' }
    default: return { text: '' }
  }
}

type Props = {
  boardId: string
  initial: BoardData
  readOnly?: boolean
  palette?: BoardPalette
  onOpenBoard: (childBoardId: string) => void
}

function Canvas({ boardId, initial, readOnly = false, palette = ADMIN_BOARD_PALETTE, onOpenBoard }: Props) {
  const rf = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(cardsToNodes(initial.cards, initial.childMeta))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesToFlow(initial.edges))
  const [pendingType, setPendingType] = useState<BoardCardType | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pendingPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Egen skriving siste 5 s → ignorer realtime-echo (Task 12)
  const localOps = useRef<Map<string, number>>(new Map())
  const markLocalOp = useCallback((rowId: string) => {
    localOps.current.set(rowId, Date.now())
  }, [])
  const isLocalOp = useCallback((rowId: string) => {
    const ts = localOps.current.get(rowId)
    return !!ts && Date.now() - ts < 5000
  }, [])

  const maxZ = useCallback(() => Math.max(0, ...nodes.map(n => n.data.card.z_index)), [nodes])

  const persist = useCallback(async (patches: CardPositionPatch[]) => {
    patches.forEach(p => markLocalOp(p.id))
    const ok = await saveCardPositions(patches)
    setSaveError(ok ? null : SAVE_ERROR_MSG)
  }, [markLocalOp])

  // Laster opp valgt fil til boardId-mappen og oppretter et bilde-/videokort på lagret klikkposisjon
  const handleFileUpload = useCallback(async (type: 'image' | 'video', file: File) => {
    // Fang posisjonen FØR await — en ny plassering kan overskrive ref-en mens opplastingen pågår
    const pos = pendingPosRef.current
    const res = await uploadBoardFile(boardId, file)
    if ('error' in res) { setSaveError(res.error); return }
    const card = await createBoardCard({
      board_id: boardId, type, x: pos.x, y: pos.y,
      content: { url: res.url }, z_index: maxZ() + 1,
    })
    if (!card) { setSaveError(SAVE_ERROR_MSG); return }
    markLocalOp(card.id)
    setNodes(ns => [...ns, cardToNode(card, initial.childMeta)])
  }, [boardId, setNodes, markLocalOp, initial.childMeta, maxZ])

  // Opprette kort ved klikk på canvas i plasseringsmodus
  const onPaneClick = useCallback(async (event: React.MouseEvent) => {
    if (!pendingType || readOnly) return
    const type = pendingType
    setPendingType(null)
    const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY })

    if (type === 'image') {
      pendingPosRef.current = pos
      imageInputRef.current?.click()
      return
    }

    if (type === 'video') {
      const url = window.prompt('Lim inn YouTube/Vimeo-lenke (eller Avbryt for å laste opp fil):')
      if (url) {
        const embed_url = parseVideoEmbed(url)
        if (!embed_url) { setSaveError('Fant ikke gyldig YouTube/Vimeo-lenke'); return }
        const card = await createBoardCard({
          board_id: boardId, type: 'video', x: pos.x, y: pos.y,
          content: { embed_url }, z_index: maxZ() + 1,
        })
        if (!card) { setSaveError(SAVE_ERROR_MSG); return }
        markLocalOp(card.id)
        setNodes(ns => [...ns, cardToNode(card, initial.childMeta)])
      } else {
        pendingPosRef.current = pos
        videoInputRef.current?.click()
      }
      return
    }

    if (type === 'link') {
      const url = window.prompt('Lim inn lenke:')?.trim()
      if (url) {
        if (!/^https?:\/\//i.test(url)) { setSaveError('Lenken må starte med http:// eller https://'); return }
        const card = await createBoardCard({
          board_id: boardId, type: 'link', x: pos.x, y: pos.y,
          content: { url }, z_index: maxZ() + 1,
        })
        if (!card) { setSaveError(SAVE_ERROR_MSG); return }
        markLocalOp(card.id)
        setNodes(ns => [...ns, cardToNode(card, initial.childMeta)])
        // Fire-and-forget metadata fetch
        fetchLinkMetadata(url).then(meta => {
          markLocalOp(card.id)
          updateCardContent(card.id, meta)
          setNodes(ns => ns.map(n => n.id === card.id
            ? { ...n, data: { ...n.data, card: { ...n.data.card, content: meta } } }
            : n))
        })
      }
      return
    }

    const card = await createBoardCard({
      board_id: boardId, type, x: pos.x, y: pos.y,
      content: defaultContent(type), z_index: maxZ() + 1,
    })
    if (!card) { setSaveError(SAVE_ERROR_MSG); return }
    markLocalOp(card.id)
    setNodes(ns => [...ns, cardToNode(card, initial.childMeta)])
  }, [pendingType, readOnly, rf, boardId, setNodes, markLocalOp, initial.childMeta, maxZ])

  // Flytt til front ved dragstart, lagre posisjoner ved slipp
  const onNodeDragStart: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    const z = maxZ() + 1
    node.data.card.z_index = z
    setNodes(ns => ns.map(n => n.id === node.id ? { ...n, zIndex: n.data.card.type === 'column' ? 0 : z + 1 } : n))
  }, [setNodes, maxZ])

  const onNodeDragStop: OnNodeDrag<CardNode> = useCallback((_e, node, dragged) => {
    const moved = dragged.length > 0 ? dragged : [node]
    persist(moved.map(n => ({
      id: n.id, x: n.position.x, y: n.position.y,
      z_index: (n as CardNode).data.card.z_index,
    })))
  }, [persist])

  // Slett valgte med Delete-tast (bekreftelse for board-kort kommer i Task 10)
  const onBeforeDelete: OnBeforeDelete<CardNode, Edge> = useCallback(async ({ nodes: delNodes, edges: delEdges }) => {
    if (readOnly) return false
    return { nodes: delNodes, edges: delEdges }
  }, [readOnly])

  const onNodesDelete = useCallback((deleted: CardNode[]) => {
    deleted.forEach(n => markLocalOp(n.id))
    deleteBoardCards(deleted.map(n => n.id)).then(ok => setSaveError(ok ? null : SAVE_ERROR_MSG))
  }, [markLocalOp])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(e => markLocalOp(e.id))
    deleteBoardEdges(deleted.map(e => e.id)).then(ok => setSaveError(ok ? null : SAVE_ERROR_MSG))
  }, [markLocalOp])

  // Drop fra Finder/Explorer direkte på lerretet — laster opp alle bilde-/videofiler på slippunktet
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    if (readOnly) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    let pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    for (const file of files) {
      const res = await uploadBoardFile(boardId, file)
      if ('error' in res) { setSaveError(res.error); continue }
      const isVideo = file.type.startsWith('video/')
      const card = await createBoardCard({
        board_id: boardId, type: isVideo ? 'video' : 'image', x: pos.x, y: pos.y,
        content: { url: res.url }, z_index: maxZ() + 1,
      })
      if (card) { markLocalOp(card.id); setNodes(ns => [...ns, cardToNode(card, initial.childMeta)]) }
      pos = { x: pos.x + 40, y: pos.y + 40 }
    }
  }, [readOnly, rf, boardId, setNodes, markLocalOp, initial.childMeta, maxZ])

  return (
    <BoardUiProvider value={{ palette, readOnly, markLocalOp }}>
      <div
        style={{ width: '100%', height: '100%', position: 'relative', background: palette.canvasBg }}
        onDrop={onDrop}
        onDragOver={e => { if (!readOnly) e.preventDefault() }}
      >
        {!readOnly && (
          <Toolbar pending={pendingType} onPick={setPendingType} enabledTypes={ENABLED_TYPES} />
        )}
        {!readOnly && (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFileUpload('image', f) }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFileUpload('video', f) }}
            />
          </>
        )}
        {saveError && (
          <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: '#3a1d1d', color: '#f0b0b0', border: '1px solid #E05555', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)' }}>
            {saveError}
            <button onClick={() => setSaveError(null)} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#f0b0b0', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={onPaneClick}
          onNodeDragStart={readOnly ? undefined : onNodeDragStart}
          onNodeDragStop={readOnly ? undefined : onNodeDragStop}
          onBeforeDelete={onBeforeDelete}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          nodesDraggable={!readOnly}
          nodesConnectable={false /* aktiveres i Task 11 */}
          elementsSelectable={!readOnly}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ cursor: pendingType ? 'crosshair' : undefined }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color={palette.border} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={() => palette.surface2} maskColor="rgba(0,0,0,0.5)" style={{ background: palette.surface }} />
        </ReactFlow>
      </div>
    </BoardUiProvider>
  )
}

export default function BoardCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

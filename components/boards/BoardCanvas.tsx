'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Edge, type OnNodeDrag, type OnBeforeDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { BoardCard, BoardCardContent, BoardCardType, BoardRefContent } from '@/lib/types'
import {
  createBoardCard, createSubBoard, deleteBoardCards, deleteBoardEdges, saveCardPositions, fetchLinkMetadata, updateCardContent,
  type BoardData, type CardPositionPatch,
} from '@/lib/actions/boards'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, type BoardPalette } from './boardContext'
import { cardsToNodes, cardToNode, edgesToFlow, CARD_WIDTH, COLUMN_WIDTH, COLUMN_PAD, type CardNode } from './toFlow'
import { restackColumn } from './columnLayout'
import { nodeTypes } from './nodes'
import Toolbar from './Toolbar'
import { uploadBoardFile } from './upload'
import { parseVideoEmbed } from './videoUrl'

const SAVE_ERROR_MSG = 'Kunne ikke lagre siste endring — sjekk nettverket og prøv igjen.'

const ENABLED_TYPES: BoardCardType[] = ['note', 'image', 'video', 'link', 'color', 'todo', 'column', 'board'] // utvides per task

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

  // Hjelpere for kolonnestabling (Task 9)
  const nodeHeight = useCallback((n: CardNode) => n.measured?.height ?? 100, [])
  const absPos = useCallback((nodeId: string) => {
    const internal = rf.getInternalNode(nodeId)
    return internal ? internal.internals.positionAbsolute : { x: 0, y: 0 }
  }, [rf])

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

    if (type === 'board') {
      const title = window.prompt('Navn på nytt board:')?.trim()
      if (!title) return
      const res = await createSubBoard(boardId, title, pos.x, pos.y)
      if (!res) { setSaveError(SAVE_ERROR_MSG); return }
      markLocalOp(res.card.id)
      const node = cardToNode(res.card, initial.childMeta)
      setNodes(ns => [...ns, { ...node, data: { ...node.data, meta: { title, cardCount: 0 } } }])
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

  // Utvidet ved Task 9: kort kan festes til / løsrives fra kolonner ved slipp,
  // og berørte kolonner restables (barn stables vertikalt, kolonnehøyden justeres).
  const onNodeDragStop: OnNodeDrag<CardNode> = useCallback((_e, node, dragged) => {
    const moved = (dragged.length > 0 ? dragged : [node]) as CardNode[]
    let next = rf.getNodes() as CardNode[]
    const patches: CardPositionPatch[] = []
    const dirtyColumns = new Set<string>()

    for (const m of moved) {
      const current = next.find(n => n.id === m.id)
      if (!current) continue
      const type = current.data.card.type
      const canJoinColumn = type !== 'column' && type !== 'board'

      const intersectingColumn = canJoinColumn
        ? (rf.getIntersectingNodes(current) as CardNode[]).find(n => n.data.card.type === 'column')
        : undefined

      if (intersectingColumn && current.parentId !== intersectingColumn.id) {
        // Fest til kolonne: posisjon relativt til kolonnen, restack etterpå
        const a = absPos(current.id)
        const colA = absPos(intersectingColumn.id)
        next = next.map(n => n.id === current.id ? {
          ...n,
          parentId: intersectingColumn.id,
          position: { x: a.x - colA.x, y: a.y - colA.y },
          style: { ...n.style, width: COLUMN_WIDTH - COLUMN_PAD * 2 },
        } : n)
        dirtyColumns.add(intersectingColumn.id)
        if (current.parentId) dirtyColumns.add(current.parentId)
      } else if (current.parentId && !intersectingColumn) {
        // Dratt ut av kolonnen: tilbake til absolutt posisjon
        const a = absPos(current.id)
        next = next.map(n => n.id === current.id ? {
          ...n,
          parentId: undefined,
          position: a,
          style: { ...n.style, width: current.data.card.width ?? CARD_WIDTH },
        } : n)
        patches.push({ id: current.id, x: a.x, y: a.y, column_id: null, sort_order: 0 })
        dirtyColumns.add(current.parentId)
      } else if (current.data.card.type === 'column') {
        patches.push({ id: current.id, x: current.position.x, y: current.position.y })
      } else {
        patches.push({
          id: current.id, x: current.position.x, y: current.position.y,
          z_index: current.data.card.z_index,
          ...(current.parentId ? { column_id: current.parentId } : {}),
        })
        // Fortsatt i samme kolonne (omplassert blant søsken) — restack for å
        // reflektere ny rekkefølge og lukke evt. mellomrom.
        if (current.parentId) dirtyColumns.add(current.parentId)
      }
    }

    for (const colId of dirtyColumns) {
      const result = restackColumn(colId, next, nodeHeight)
      next = result.nodes
      result.patches.forEach(p => {
        const idx = patches.findIndex(q => q.id === p.id)
        if (idx >= 0) patches[idx] = { ...patches[idx], ...p }
        else patches.push(p)
      })
    }

    setNodes(next)
    if (patches.length) persist(patches)
  }, [rf, absPos, nodeHeight, persist, setNodes])

  // Etter innlasting: restack kolonner én gang når alle noder er målt, så lagret
  // stabling/høyde vises korrekt fra start (uten dette blir kolonnehøyden feil ved refresh).
  const restackedOnce = useRef(false)
  useEffect(() => {
    if (restackedOnce.current) return
    const all = rf.getNodes() as CardNode[]
    if (all.length === 0 || all.some(n => !n.measured?.height)) return // vent til målt
    restackedOnce.current = true
    let next = all
    for (const col of all.filter(n => n.data.card.type === 'column')) {
      next = restackColumn(col.id, next, nodeHeight).nodes // uten persist — bare visuelt
    }
    setNodes(next)
  }, [nodes, rf, nodeHeight, setNodes])

  // Dobbeltklikk på et board-kort navigerer inn i underboardet — ikke gatet på
  // readOnly, siden offentlige delingssider også skal kunne navigere i boardhierarkiet.
  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, n: CardNode) => {
    const c = n.data.card
    if (c.type === 'board') onOpenBoard((c.content as BoardRefContent).child_board_id)
  }, [onOpenBoard])

  // Slett valgte med Delete-tast — bekreftelse kreves når board-kort er involvert,
  // siden det kaskaderer til sletting av hele underboardet (Task 3).
  const onBeforeDelete: OnBeforeDelete<CardNode, Edge> = useCallback(async ({ nodes: delNodes, edges: delEdges }) => {
    if (readOnly) return false
    const boardCards = delNodes.filter(n => n.data.card.type === 'board')
    if (boardCards.length > 0) {
      const names = boardCards.map(n => (n.data.card.content as BoardRefContent).title).join(', ')
      if (!window.confirm(`Slette underboard(ene) «${names}» med alt innhold? Dette kan ikke angres.`)) return false
    }
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
          onNodeDoubleClick={onNodeDoubleClick}
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

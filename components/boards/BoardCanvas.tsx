'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Edge, type OnNodeDrag, type OnBeforeDelete, type Connection,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { BoardCard, BoardCardContent, BoardCardType, BoardEdge, BoardRefContent } from '@/lib/types'
import {
  createBoardCard, createSubBoard, createBoardEdge, deleteBoardCards, deleteBoardEdges, saveCardPositions, fetchLinkMetadata, updateCardContent, updateBoardEdgeLabel,
  type BoardData, type CardPositionPatch,
} from '@/lib/actions/boards'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, type BoardPalette } from './boardContext'
import { cardsToNodes, cardToNode, edgesToFlow, edgeToFlow, CARD_WIDTH, COLUMN_WIDTH, COLUMN_PAD, type CardNode } from './toFlow'
import { restackColumn } from './columnLayout'
import { nodeTypes } from './nodes'
import Toolbar from './Toolbar'
import { uploadBoardFile } from './upload'
import { parseVideoEmbed } from './videoUrl'
import { useBoardRealtime } from '@/hooks/useBoardRealtime'

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

  // Realtime: reflekter kort/piler opprettet/endret/slettet av andre klienter (Task 12).
  // isLocalOp filtrerer bort vårt eget echo innen 5 s-vinduet.
  const onRemoteCard = useCallback((evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<BoardCard> & { id: string }) => {
    if (evt === 'DELETE') {
      setNodes(ns => ns.filter(n => n.id !== row.id))
      return
    }
    const card = row as BoardCard
    setNodes(ns => {
      const exists = ns.some(n => n.id === card.id)
      const fresh = cardToNode(card, initial.childMeta)
      if (card.type === 'board' && !initial.childMeta[(card.content as BoardRefContent).child_board_id]) {
        fresh.data.meta = { title: (card.content as BoardRefContent).title, cardCount: 0 }
      }
      if (!exists) return [...ns, fresh]
      return ns.map(n => n.id === card.id ? { ...fresh, selected: n.selected } : n)
    })
    // Kortet kan ha byttet/fått kolonne fra en annen klient — restack-effekten over
    // kjører kun én gang per last, så vi nullstiller guarden for å trigge en ny visuell
    // restack av kolonnen (uten persist, se effekten).
    if (card.column_id) restackedOnce.current = false
  }, [setNodes, initial.childMeta])

  const onRemoteEdge = useCallback((evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<BoardEdge> & { id: string }) => {
    if (evt === 'DELETE') { setEdges(es => es.filter(e => e.id !== row.id)); return }
    const edge = row as BoardEdge
    setEdges(es => {
      const flow = edgeToFlow(edge)
      return es.some(e => e.id === edge.id) ? es.map(e => e.id === edge.id ? flow : e) : [...es, flow]
    })
  }, [setEdges])

  useBoardRealtime(boardId, { enabled: !readOnly, isLocalOp, onCard: onRemoteCard, onEdge: onRemoteEdge })

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

    // React Flow v12s getElementsToRemove tar automatisk med alle barn (parentId)
    // av en slettet kolonne i delNodes. Server-siden (deleteBoardCards) løsriver
    // derimot barna i stedet for å slette dem når kolonnen slettes — de skal IKKE
    // være med i det som faktisk slettes her. Vi filtrerer dem ut og speiler
    // løsrivingen lokalt (samme felter som detach-grenen i onNodeDragStop) +
    // markLocalOp, slik at et forsinket realtime-echo for serverens UPDATE på
    // barna ikke krasjer med denne lokale tilstanden. Piler mellom to barn som
    // begge overlever (eller mellom et overlevende barn og et annet kort) skal
    // også overleve, så de filtreres ut av det som slettes på samme måte.
    const deletedColumnIds = new Set(delNodes.filter(n => n.data.card.type === 'column').map(n => n.id))
    let nodesToDelete = delNodes
    let edgesToDelete = delEdges

    if (deletedColumnIds.size > 0) {
      const survivorIds = new Set(
        delNodes.filter(n => n.parentId && deletedColumnIds.has(n.parentId)).map(n => n.id)
      )
      if (survivorIds.size > 0) {
        survivorIds.forEach(id => markLocalOp(id))
        setNodes(ns => {
          const colPos = new Map(ns.filter(n => deletedColumnIds.has(n.id)).map(n => [n.id, n.position]))
          return ns.map(n => {
            if (!survivorIds.has(n.id) || !n.parentId) return n
            const col = colPos.get(n.parentId) ?? { x: 0, y: 0 }
            return {
              ...n,
              parentId: undefined,
              position: { x: col.x + n.position.x + 24, y: col.y + n.position.y },
              style: { ...n.style, width: n.data.card.width ?? CARD_WIDTH },
            }
          })
        })
        nodesToDelete = delNodes.filter(n => !survivorIds.has(n.id))
        edgesToDelete = delEdges.filter(e => !survivorIds.has(e.source) && !survivorIds.has(e.target))
      }
    }

    return { nodes: nodesToDelete, edges: edgesToDelete }
  }, [readOnly, setNodes, markLocalOp])

  const onNodesDelete = useCallback((deleted: CardNode[]) => {
    deleted.forEach(n => markLocalOp(n.id))
    deleteBoardCards(deleted.map(n => n.id)).then(ok => setSaveError(ok ? null : SAVE_ERROR_MSG))
  }, [markLocalOp])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(e => markLocalOp(e.id))
    deleteBoardEdges(deleted.map(e => e.id)).then(ok => setSaveError(ok ? null : SAVE_ERROR_MSG))
  }, [markLocalOp])

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    const edge = await createBoardEdge({ board_id: boardId, from_card_id: conn.source, to_card_id: conn.target })
    if (!edge) { setSaveError('Kunne ikke lagre pilen'); return }
    markLocalOp(edge.id)
    setEdges(es => [...es, edgeToFlow(edge)])
  }, [boardId, setEdges, markLocalOp])

  const onEdgeDoubleClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    if (readOnly) return
    const label = window.prompt('Tekst på pilen (tom for å fjerne):', (edge.label as string) ?? '')
    if (label === null) return
    markLocalOp(edge.id)
    updateBoardEdgeLabel(edge.id, label.trim() || null)
    setEdges(es => es.map(e => e.id === edge.id ? { ...e, label: label.trim() || undefined } : e))
  }, [readOnly, setEdges, markLocalOp])

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
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          // Alltid true (også readOnly): React Flow gater pointer-events på noder til
          // isSelectable || isDraggable || onClick/... — uten dette blir dobbeltklikk
          // (board-navigasjon, lightbox) usynlig for DOM-en på delingssiden, siden
          // pointer-events: none stopper alle museevents inkl. onDoubleClick.
          // Selection er ufarlig i readOnly: deleteKeyCode er null og onBeforeDelete
          // returnerer false, så ingenting kan faktisk slettes/redigeres.
          elementsSelectable={true}
          // Ikke-draggbare noder får ikke React Flows interne "nopan"-klasse (den
          // settes kun når isDraggable er true), så d3-zoom sin egen
          // dblclick.zoom-handler fanger opp museeventet på nodene og kaller
          // stopPropagation FØR det når Reacts rot-delegerte lytter — da når
          // onNodeDoubleClick aldri fram i readOnly. Slår derfor av
          // zoomOnDoubleClick i readOnly (kun for lerretet/panen; zoom med
          // hjul/knapper/pinch fungerer fortsatt).
          zoomOnDoubleClick={!readOnly}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: palette.border, strokeWidth: 1.5 } }}
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

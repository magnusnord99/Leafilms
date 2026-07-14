import type { NodeTypes } from '@xyflow/react'
import NoteNode from './NoteNode'
import ImageNode from './ImageNode'
import VideoNode from './VideoNode'

export const nodeTypes: NodeTypes = {
  note: NoteNode,
  image: ImageNode,
  video: VideoNode,
}

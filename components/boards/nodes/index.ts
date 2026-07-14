import type { NodeTypes } from '@xyflow/react'
import NoteNode from './NoteNode'
import ImageNode from './ImageNode'
import VideoNode from './VideoNode'
import LinkNode from './LinkNode'

export const nodeTypes: NodeTypes = {
  note: NoteNode,
  image: ImageNode,
  video: VideoNode,
  link: LinkNode,
}

import type { NodeTypes } from '@xyflow/react'
import NoteNode from './NoteNode'
import ImageNode from './ImageNode'
import VideoNode from './VideoNode'
import LinkNode from './LinkNode'
import ColorNode from './ColorNode'
import TodoNode from './TodoNode'
import ColumnNode from './ColumnNode'
import BoardNode from './BoardNode'
import ScheduleNode from './ScheduleNode'
import StorylineNode from './StorylineNode'

export const nodeTypes: NodeTypes = {
  note: NoteNode,
  image: ImageNode,
  video: VideoNode,
  link: LinkNode,
  color: ColorNode,
  todo: TodoNode,
  column: ColumnNode,
  board: BoardNode,
  schedule: ScheduleNode,
  storyline: StorylineNode,
}

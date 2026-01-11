'use client'

import { SectionImage } from '@/lib/types'

type ImagePositionControlsProps = {
  sectionId: string
  sectionImage: SectionImage | undefined
  currentPos: { x: number; y: number; zoom: number | null }
  onPositionChange: (pos: { x: number; y: number; zoom: number | null }) => void
  onReset: () => void
  onChangeImage: () => void
}

export function ImagePositionControls({
  sectionId,
  sectionImage,
  currentPos,
  onPositionChange,
  onReset,
  onChangeImage
}: ImagePositionControlsProps) {
  return (
    <div className="absolute top-16 right-4 z-20 bg-white/95 p-4 rounded-lg shadow-xl min-w-[250px]">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-dark">
          Zoom: {currentPos.zoom === null ? 'Cover (100%)' : `${Math.round(currentPos.zoom * 100)}%`}
        </label>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={currentPos.zoom === null ? 1.0 : currentPos.zoom}
          onChange={(e) => {
            const newZoom = parseFloat(e.target.value)
            const newPos = { ...currentPos, zoom: newZoom === 1.0 ? null : newZoom }
            onPositionChange(newPos)
          }}
          className="w-full"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-dark">Posisjon X: {Math.round(currentPos.x)}%</label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={currentPos.x}
          onChange={(e) => {
            const newX = parseFloat(e.target.value)
            const newPos = { ...currentPos, x: newX }
            onPositionChange(newPos)
          }}
          className="w-full"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-dark">Posisjon Y: {Math.round(currentPos.y)}%</label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={currentPos.y}
          onChange={(e) => {
            const newY = parseFloat(e.target.value)
            const newPos = { ...currentPos, y: newY }
            onPositionChange(newPos)
          }}
          className="w-full"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onReset()
          }}
          className="flex-1 bg-gray-200 hover:bg-gray-300 text-dark px-3 py-2 rounded transition"
        >
          Reset
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onChangeImage()
          }}
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded transition"
        >
          Bytt bilde
        </button>
      </div>
    </div>
  )
}


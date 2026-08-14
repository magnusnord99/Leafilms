'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

function ToolbarButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 26, height: 26, padding: '0 6px', borderRadius: 5,
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 700,
        background: active ? C.accentBg : 'transparent',
        color: active ? C.accent : C.text3,
        border: active ? '1px solid rgba(124,92,252,0.3)' : '1px solid transparent',
        cursor: 'pointer', lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
      <ToolbarButton label="Fet" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span style={{ fontWeight: 700 }}>B</span>
      </ToolbarButton>
      <ToolbarButton label="Kursiv" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span style={{ fontStyle: 'italic' }}>I</span>
      </ToolbarButton>
      <ToolbarButton label="Understreket" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolbarButton>
      <div style={{ width: 1, height: 16, background: C.border, margin: '0 4px' }} />
      <ToolbarButton label="Overskrift" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton label="Underoverskrift" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <div style={{ width: 1, height: 16, background: C.border, margin: '0 4px' }} />
      <ToolbarButton label="Punktliste" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="2" cy="3.5" r="1" fill="currentColor" /><rect x="5" y="2.75" width="7" height="1.5" rx="0.5" fill="currentColor" />
          <circle cx="2" cy="9.5" r="1" fill="currentColor" /><rect x="5" y="8.75" width="7" height="1.5" rx="0.5" fill="currentColor" />
        </svg>
      </ToolbarButton>
    </div>
  )
}

export default function RichNotesEditor({
  value,
  onChange,
  placeholder,
  minHeight = 96,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        style: `min-height:${minHeight}px; outline: none;`,
      },
    },
  })

  if (!editor) return null

  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <Toolbar editor={editor} />
      <div style={{ padding: '10px 12px' }}>
        <EditorContent editor={editor} className="rich-notes-editor" />
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { submitFeedback } from '@/lib/actions/feedback'
import { supabase } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'

type Type = 'bug' | 'wish'

function priorityColor(p: 1 | 2 | 3) {
  return p === 1 ? '#C05050' : p === 2 ? '#C49434' : '#8484A0'
}

export function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<Type>('bug')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState<1 | 2 | 3>(2)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Paste skjermbilde direkte i modalen
  useEffect(() => {
    if (!open) return
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find(item => item.type.startsWith('image/'))
        ?.getAsFile()
      if (file) attachImage(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  function attachImage(file: File) {
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  function removeImage() {
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function reset() {
    setMessage('')
    setType('bug')
    setPriority(2)
    removeImage()
  }

  async function handleSubmit() {
    if (!message.trim()) return
    setSubmitting(true)

    let imagePath: string | undefined
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() ?? 'png'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('feedback').upload(path, imageFile, { contentType: imageFile.type })
      if (!error) imagePath = path
    }

    const result = await submitFeedback(type, message.trim(), pathname, priority, imagePath)
    setSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      return
    }
    setDone(true)
    setTimeout(() => {
      setDone(false)
      setOpen(false)
      reset()
    }, 1800)
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Meld inn feil eller ønske"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 90,
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: C.surface, boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          color: C.text3, fontSize: '1.1rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = C.text
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = C.text3
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
        }}
      >
        ⚑
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 20 }}
          onClick={() => { if (!submitting) { setOpen(false); reset() } }}
        >
          <div
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 20, width: 'min(320px, calc(100vw - 40px))',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', color: '#4CAF7D', fontWeight: 600 }}>✓ Innmeldt</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>Takk for tilbakemeldingen!</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text }}>
                    Tilbakemelding
                  </p>
                  <button onClick={() => { setOpen(false); reset() }} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                </div>

                {/* Type-toggle */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {(['bug', 'wish'] as Type[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      style={{
                        flex: 1, padding: '7px', borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                        border: `1px solid ${type === t ? (t === 'bug' ? 'rgba(192,80,80,0.6)' : C.accent) : C.border}`,
                        background: type === t ? (t === 'bug' ? 'rgba(192,80,80,0.1)' : C.accentBg) : 'none',
                        color: type === t ? (t === 'bug' ? '#C05050' : C.accent) : C.text3,
                        transition: 'all 0.12s',
                      }}
                    >
                      {t === 'bug' ? 'Feil' : 'Ønske'}
                    </button>
                  ))}
                </div>

                {/* Prioritet */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginBottom: 6 }}>Prioritet</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([1, 2, 3] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                          border: `1px solid ${priority === p ? priorityColor(p) : C.border}`,
                          background: priority === p ? `${priorityColor(p)}18` : 'none',
                          color: priority === p ? priorityColor(p) : C.text3,
                          transition: 'all 0.12s',
                        }}
                      >
                        {p === 1 ? 'Høy' : p === 2 ? 'Medium' : 'Lav'}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  autoFocus
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={type === 'bug' ? 'Beskriv feilen du fant...' : 'Hva skulle du ønske fantes?'}
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'none',
                    background: C.surface2, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '9px 10px', outline: 'none',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '1rem',
                    color: C.text, lineHeight: 1.5, marginBottom: 10,
                  }}
                />

                {/* Bilde-vedlegg */}
                {imagePreview ? (
                  <div style={{ position: 'relative', marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    <img src={imagePreview} alt="Vedlegg" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={removeImage}
                      aria-label="Fjern bilde"
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: 'rgba(0,0,0,0.6)', color: '#fff',
                        fontSize: '0.85rem', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%', padding: '8px', borderRadius: 7, marginBottom: 10,
                      border: `1px dashed ${C.border}`, background: 'none',
                      color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                      cursor: 'pointer', textAlign: 'center',
                    }}
                  >
                    Legg ved skjermbilde — eller lim inn (⌘V)
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) attachImage(e.target.files[0]) }}
                />

                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginBottom: 10 }}>
                  Side: {pathname}
                </p>

                {submitError && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#C05050', marginBottom: 8 }}>
                    Feil: {submitError}
                  </p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !message.trim()}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                    background: C.accent, color: '#fff',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                    cursor: message.trim() ? 'pointer' : 'not-allowed',
                    opacity: (!message.trim() || submitting) ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {submitting ? 'Laster opp...' : 'Send inn'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

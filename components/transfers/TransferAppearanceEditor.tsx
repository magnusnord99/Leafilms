'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'

type Props = {
  transferId: string
  backgroundImagePath: string | null
  customerId: string | null
  onClose: () => void
  /** Kalt når bakgrunnsbildet er endret, slik at listen som åpnet modalen kan oppdatere sin lokale state */
  onBackgroundChanged: (path: string | null) => void
}

type CustomerBrief = { id: string; name: string; logo_path: string | null }

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
}

function Thumb({ path, alt }: { path: string | null; alt: string }) {
  const url = path ? createClient().storage.from('assets').getPublicUrl(path).data.publicUrl : null
  return (
    <div style={{
      width: 72, height: 56, borderRadius: 8, flexShrink: 0,
      background: C.surface2, border: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {url ? (
        <img src={url} alt={alt} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: '1rem', color: C.text3 }}>—</span>
      )}
    </div>
  )
}

export function TransferAppearanceEditor({ transferId, backgroundImagePath, customerId, onClose, onBackgroundChanged }: Props) {
  const [bgPath, setBgPath] = useState(backgroundImagePath)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [customer, setCustomer] = useState<CustomerBrief | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(!!customerId)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    if (!customerId) return
    const supabase = createClient()
    supabase.from('customers').select('id, name, logo_path').eq('id', customerId).single()
      .then(({ data }) => { setCustomer(data); setLoadingCustomer(false) })
  }, [customerId])

  async function handleUploadBackground(file: File) {
    setUploadingBg(true)
    const supabase = createClient()
    const path = `transfer-backgrounds/${transferId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('assets').upload(path, file)
    if (uploadError) {
      alert('Kunne ikke laste opp bildet: ' + uploadError.message)
      setUploadingBg(false)
      return
    }
    const oldPath = bgPath
    const { error: updateError } = await supabase.from('transfers').update({ background_image_path: path }).eq('id', transferId)
    setUploadingBg(false)
    if (updateError) {
      alert('Bildet ble lastet opp, men kunne ikke lagres på leveransen. Prøv igjen.')
      return
    }
    if (oldPath) await supabase.storage.from('assets').remove([oldPath])
    setBgPath(path)
    onBackgroundChanged(path)
  }

  async function handleRemoveBackground() {
    if (!bgPath) return
    if (!confirm('Fjerne bakgrunnsbildet?')) return
    const supabase = createClient()
    const path = bgPath
    const { error } = await supabase.from('transfers').update({ background_image_path: null }).eq('id', transferId)
    if (error) {
      alert('Kunne ikke fjerne bildet. Prøv igjen.')
      return
    }
    await supabase.storage.from('assets').remove([path])
    setBgPath(null)
    onBackgroundChanged(null)
  }

  async function handleUploadLogo(file: File) {
    if (!customer) return
    setUploadingLogo(true)
    const supabase = createClient()
    const path = `customer-logos/${customer.id}/main-${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('assets').upload(path, file)
    if (uploadError) {
      alert('Kunne ikke laste opp logoen: ' + uploadError.message)
      setUploadingLogo(false)
      return
    }
    const oldPath = customer.logo_path
    const { error: updateError } = await supabase.from('customers').update({ logo_path: path }).eq('id', customer.id)
    setUploadingLogo(false)
    if (updateError) {
      alert('Logoen ble lastet opp, men kunne ikke lagres på kunden. Prøv igjen.')
      return
    }
    if (oldPath) await supabase.storage.from('assets').remove([oldPath])
    setCustomer(prev => prev ? { ...prev, logo_path: path } : prev)
  }

  async function handleRemoveLogo() {
    if (!customer?.logo_path) return
    if (!confirm('Fjerne logoen? Dette fjerner den fra alle leveranser til denne kunden.')) return
    const supabase = createClient()
    const path = customer.logo_path
    const { error } = await supabase.from('customers').update({ logo_path: null }).eq('id', customer.id)
    if (error) {
      alert('Kunne ikke fjerne logoen. Prøv igjen.')
      return
    }
    await supabase.storage.from('assets').remove([path])
    setCustomer(prev => prev ? { ...prev, logo_path: null } : prev)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
          width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.05rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>
            Rediger utseende
          </h2>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
            Hvordan leveransesiden (/d/...) ser ut for mottakeren
          </p>
        </div>

        {/* Bakgrunnsbilde */}
        <div>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text2, marginBottom: 8 }}>
            Bakgrunnsbilde <span style={{ fontWeight: 400, color: C.text3 }}>— kun denne leveransen</span>
          </p>
          <Row>
            <Thumb path={bgPath} alt="Bakgrunnsbilde" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor="transfer-bg-upload"
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent, textDecoration: 'underline', cursor: uploadingBg ? 'default' : 'pointer', opacity: uploadingBg ? 0.6 : 1 }}
              >
                {uploadingBg ? 'Laster opp...' : bgPath ? 'Bytt bilde' : '+ Last opp bilde'}
              </label>
              <input
                id="transfer-bg-upload"
                type="file"
                accept="image/*"
                disabled={uploadingBg}
                style={{ display: 'none' }}
                onChange={e => { const file = e.target.files?.[0]; if (file) handleUploadBackground(file); e.target.value = '' }}
              />
              {bgPath && (
                <button onClick={handleRemoveBackground} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.danger, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                  Fjern
                </button>
              )}
            </div>
          </Row>
        </div>

        {/* Kundelogo */}
        <div>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text2, marginBottom: 8 }}>
            Kundelogo <span style={{ fontWeight: 400, color: C.text3 }}>— deles med alle leveranser til {customer?.name ?? 'denne kunden'}</span>
          </p>
          {!customerId ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, fontStyle: 'italic' }}>
              Leveransen er ikke knyttet til en kunde — ingen logo å vise.
            </p>
          ) : loadingCustomer ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
          ) : (
            <Row>
              <Thumb path={customer?.logo_path ?? null} alt="Kundelogo" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  htmlFor="transfer-logo-upload"
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent, textDecoration: 'underline', cursor: uploadingLogo ? 'default' : 'pointer', opacity: uploadingLogo ? 0.6 : 1 }}
                >
                  {uploadingLogo ? 'Laster opp...' : customer?.logo_path ? 'Bytt logo' : '+ Last opp logo'}
                </label>
                <input
                  id="transfer-logo-upload"
                  type="file"
                  accept="image/*"
                  disabled={uploadingLogo}
                  style={{ display: 'none' }}
                  onChange={e => { const file = e.target.files?.[0]; if (file) handleUploadLogo(file); e.target.value = '' }}
                />
                {customer?.logo_path && (
                  <button onClick={handleRemoveLogo} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.danger, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    Fjern
                  </button>
                )}
              </div>
            </Row>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            alignSelf: 'flex-end', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
            padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
            background: C.surface2, color: C.text2, border: `1px solid ${C.border}`,
          }}
        >
          Ferdig
        </button>
      </div>
    </div>
  )
}

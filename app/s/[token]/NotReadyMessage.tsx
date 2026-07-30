import { SELECTION_STRINGS, type SelectionLanguage } from './strings'

export default function NotReadyMessage({ language }: { language: SelectionLanguage }) {
  const t = SELECTION_STRINGS[language]
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      background: '#0C0B09', padding: 32,
    }}>
      <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.6rem', fontWeight: 500, color: '#E8E0D0', marginBottom: 10 }}>
        {t.notReadyTitle}
      </h1>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#8A8070', maxWidth: 380 }}>
        {t.notReadyBody}
      </p>
    </div>
  )
}

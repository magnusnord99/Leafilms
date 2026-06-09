import { getLostProjects, getLostStats } from '@/lib/actions/lost'
import { LOST_REASON_LABELS, type LostReason } from '@/lib/lost-constants'
import { PIPELINE_STAGES } from '@/lib/types'
import { C } from '@/lib/admin-theme'

function stageLabel(stage: string) {
  return PIPELINE_STAGES.find(s => s.value === stage)?.label ?? stage
}

export default async function TaptePage() {
  const [projects, stats] = await Promise.all([getLostProjects(), getLostStats()])

  const topReason = Object.entries(stats.byReason).sort((a, b) => b[1] - a[1])[0]
  const topStage  = Object.entries(stats.byStage).sort((a, b) => b[1] - a[1])[0]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Tapte prosjekter
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
            Prosjekter og pitcher som ikke ble til salg
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Totalt tapt', value: stats.total.toString() },
            { label: 'Vanligste årsak', value: topReason ? LOST_REASON_LABELS[topReason[0] as LostReason] : '–' },
            { label: 'Vanligste steg', value: topStage ? stageLabel(topStage[0]) : '–' },
            { label: 'Win-rate', value: stats.winLossRatio !== null ? `${stats.winLossRatio}%` : '–' },
          ].map(stat => (
            <div key={stat.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                {stat.label}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 600, color: C.text }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Årsaksfordeling */}
        {stats.total > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', marginBottom: 24 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
              Fordeling per årsak
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(LOST_REASON_LABELS).map(([key, label]) => {
                const count = stats.byReason[key] ?? 0
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: count > 0 ? C.text2 : C.text3, width: 160, flexShrink: 0 }}>
                      {label}
                    </span>
                    <div style={{ flex: 1, height: 6, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: count > 0 ? C.danger : 'transparent', borderRadius: 3, transition: 'width 0.3s ease', opacity: 0.7 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, width: 32, textAlign: 'right', flexShrink: 0 }}>
                      {count > 0 ? count : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Liste */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
              Alle tapte prosjekter
            </p>
          </div>
          {projects.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>
                Ingen tapte prosjekter registrert ennå.
              </p>
            </div>
          ) : (
            <div>
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 18px', borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : 'none' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </p>
                    {p.client_name && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                        {p.client_name}
                      </p>
                    )}
                    {p.lost_notes && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, fontStyle: 'italic', marginTop: 2 }}>
                        {p.lost_notes}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: '#E8A0A0', background: 'rgba(224,85,85,0.1)', padding: '3px 9px', borderRadius: 4 }}>
                      {LOST_REASON_LABELS[p.lost_reason]}
                    </span>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {stageLabel(p.lost_stage)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {new Date(p.lost_at).toLocaleDateString('nb-NO')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

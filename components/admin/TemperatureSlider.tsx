'use client'

import { useId } from 'react'
import type { LeadTemperature } from '@/lib/actions/leads'
import { LEAD_TEMPERATURE_CONFIG, LEAD_TEMPERATURE_ORDER } from '@/lib/lead-temperature'
import { C } from '@/lib/admin-theme'

const STEP_INDEX: Record<LeadTemperature, number> = {
  cold: 0,
  lukewarm: 1,
  warm: 2,
}

// Tre-stegs slider (kald → lunken → varm) — erstatter den gamle <select>-en
// for temperatur. Ikke-satt vises som en dempet, midtstilt slider man må
// dra/klikke på for å faktisk velge en verdi; "Fjern"-lenken tar den tilbake.
export function TemperatureSlider({ value, onChange, onClear }: {
  value: LeadTemperature | ''
  onChange: (value: LeadTemperature) => void
  onClear?: () => void
}) {
  const trackClass = useId().replace(/:/g, '')
  const isSet = value !== ''
  const step = isSet ? STEP_INDEX[value] : 1
  const activeColor = isSet ? LEAD_TEMPERATURE_CONFIG[value].color : C.text3
  const gradient = `linear-gradient(to right, ${LEAD_TEMPERATURE_CONFIG.cold.color}, ${LEAD_TEMPERATURE_CONFIG.lukewarm.color}, ${LEAD_TEMPERATURE_CONFIG.warm.color})`

  return (
    <div>
      <style>{`
        .temp-slider-${trackClass} { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; cursor: pointer; }
        .temp-slider-${trackClass}::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: ${gradient}; opacity: ${isSet ? 1 : 0.4}; }
        .temp-slider-${trackClass}::-moz-range-track { height: 6px; border-radius: 3px; background: ${gradient}; opacity: ${isSet ? 1 : 0.4}; }
        .temp-slider-${trackClass}::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -5px; border-radius: 50%; background: ${activeColor}; border: 2px solid ${C.surface}; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: pointer; }
        .temp-slider-${trackClass}::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: ${activeColor}; border: 2px solid ${C.surface}; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: pointer; }
      `}</style>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={step}
        onChange={e => onChange(LEAD_TEMPERATURE_ORDER[Number(e.target.value)])}
        className={`temp-slider-${trackClass}`}
        aria-label="Temperatur"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {LEAD_TEMPERATURE_ORDER.map(t => (
          <span
            key={t}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem',
              fontWeight: isSet && value === t ? 700 : 500,
              color: isSet && value === t ? LEAD_TEMPERATURE_CONFIG[t].color : C.text3,
              transition: 'color 0.12s',
            }}
          >
            {LEAD_TEMPERATURE_CONFIG[t].label}
          </span>
        ))}
      </div>
      {isSet && onClear && (
        <button
          type="button"
          onClick={onClear}
          style={{
            marginTop: 4, background: 'none', border: 'none', padding: 0,
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, cursor: 'pointer',
          }}
        >
          Fjern temperatur
        </button>
      )}
    </div>
  )
}

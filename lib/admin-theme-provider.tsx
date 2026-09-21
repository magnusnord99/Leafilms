'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'leafilms-admin-theme'

const AdminThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null)

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null
    setThemeState(stored ?? systemTheme())

    if (stored) return
    // Ingen manuelt valg lagret ennå — følg OS-innstilling live.
    const mql = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setThemeState(mql.matches ? 'light' : 'dark')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }, [])

  return (
    <AdminThemeContext.Provider value={{ theme, setTheme }}>
      <div className="admin-theme-root" data-theme={theme} style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  )
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext)
  if (!ctx) throw new Error('useAdminTheme må brukes inne i AdminThemeProvider')
  return ctx
}

export function AdminThemeToggle() {
  const { theme, setTheme } = useAdminTheme()
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      title={isLight ? 'Bytt til mørk modus' : 'Bytt til lys modus'}
      aria-label={isLight ? 'Bytt til mørk modus' : 'Bytt til lys modus'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: 8,
        border: '1px solid var(--admin-border)',
        background: 'var(--admin-surface)',
        color: 'var(--admin-text2)',
        cursor: 'pointer',
      }}
    >
      {isLight ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </button>
  )
}

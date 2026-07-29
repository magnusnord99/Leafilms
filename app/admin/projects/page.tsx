'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProjectsListView } from './ListView'
import { ProjectsBoardView } from './BoardView'
import { C } from '@/lib/admin-theme'
import type { ProjectsView } from '@/components/admin/ProjectsViewToggle'

const STORAGE_KEY = 'admin-projects-view'

function isProjectsView(value: string | null): value is ProjectsView {
  return value === 'list' || value === 'board'
}

function getInitialView(paramView: string | null): ProjectsView {
  if (isProjectsView(paramView)) return paramView
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isProjectsView(stored)) return stored
  }
  return 'list'
}

function ProjectsPageContent() {
  const searchParams = useSearchParams()
  const [view, setView] = useState<ProjectsView>(() => getInitialView(searchParams.get('view')))

  // ?view= i URL-en vinner alltid hvis den er der (f.eks. lenker fra andre sider)
  useEffect(() => {
    const paramView = searchParams.get('view')
    if (isProjectsView(paramView) && paramView !== view) setView(paramView)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function changeView(next: ProjectsView) {
    setView(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    const url = new URL(window.location.href)
    url.searchParams.set('view', next)
    window.history.replaceState({}, '', url)
  }

  return view === 'board'
    ? <ProjectsBoardView view={view} onViewChange={changeView} />
    : <ProjectsListView view={view} onViewChange={changeView} />
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ width: 24, height: 24, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <ProjectsPageContent />
    </Suspense>
  )
}

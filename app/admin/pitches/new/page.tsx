'use client'

import { Suspense } from 'react'
import { C } from '@/lib/admin-theme'
import ProjectForm from '../../projects/new/ProjectForm'

export default function NewPitch() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%' }} />
      </div>
    }>
      <ProjectForm entry="pitch" />
    </Suspense>
  )
}

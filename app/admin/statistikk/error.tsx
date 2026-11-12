'use client'
export default function StatisticsError({ reset }: { reset: () => void }) {
  return <div className="p-8"><h1 className="mb-3 text-xl font-semibold">Kunne ikke hente statistikken</h1>
    <p className="mb-4">Prøv igjen om litt. Ingen historikk er endret.</p><button onClick={reset} className="rounded bg-violet-600 px-4 py-2 text-white">Prøv igjen</button></div>
}

import { redirect } from 'next/navigation'

// Pipeline og Prosjekter er slått sammen til én side (/admin/projects) med et
// liste/board-valg. Denne ruten beholdes kun som redirect for gamle bokmerker/lenker.
export default function PipelinePage() {
  redirect('/admin/projects?view=board')
}

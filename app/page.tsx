import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect til admin dashboard
  redirect('/admin')
}

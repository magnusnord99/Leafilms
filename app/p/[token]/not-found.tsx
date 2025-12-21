import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-8">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-400 mb-8">
          Prosjektet finnes ikke eller linken er utløpt.
        </p>
        <Link
          href="/"
          className="text-gray-500 hover:text-white transition underline"
        >
          Gå til forsiden
        </Link>
      </div>
    </div>
  )
}


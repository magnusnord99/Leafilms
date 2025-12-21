'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input, Textarea } from '@/components/ui'

export default function NewCustomer() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    address: '',
    notes: ''
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([formData])
        .select()
        .single()

      if (error) throw error

      router.push(`/admin/customers/${data.id}/projects`)
    } catch (error: any) {
      console.error('Error creating customer:', error)
      alert('❌ Kunne ikke opprette kunde: ' + (error.message || 'Ukjent feil'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/admin/customers">
            <Button variant="secondary" size="sm">← Tilbake</Button>
          </Link>
        </div>

        <Card className="p-8">
          <Heading as="h1" size="lg" className="mb-6">Ny Kunde</Heading>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Navn *</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Kundens navn"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">E-post</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="kunde@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Firma</label>
              <Input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Firmanavn"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Telefon</label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+47 123 45 678"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Adresse</label>
              <Textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Gateadresse, postnummer, by"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notater</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Interne notater om kunden..."
                rows={4}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !formData.name}
              >
                {loading ? 'Oppretter...' : 'Opprett Kunde'}
              </Button>
              <Link href="/admin/customers">
                <Button type="button" variant="secondary">Avbryt</Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}


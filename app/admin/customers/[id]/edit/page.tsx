'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input, Textarea } from '@/components/ui'
import { Customer } from '@/lib/types'

export default function EditCustomer() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    address: '',
    notes: ''
  })

  useEffect(() => {
    if (customerId) {
      fetchCustomer()
    }
  }, [customerId])

  async function fetchCustomer() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()

      if (error) throw error

      setCustomer(data as Customer)
      setFormData({
        name: data.name || '',
        email: data.email || '',
        company: data.company || '',
        phone: data.phone || '',
        address: data.address || '',
        notes: data.notes || ''
      })
    } catch (error: any) {
      console.error('Error fetching customer:', error)
      alert('❌ Kunne ikke hente kunde: ' + (error.message || 'Ukjent feil'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          ...formData,
          updated_at: new Date().toISOString()
        })
        .eq('id', customerId)

      if (error) throw error

      router.push(`/admin/customers/${customerId}/projects`)
    } catch (error: any) {
      console.error('Error updating customer:', error)
      alert('❌ Kunne ikke oppdatere kunde: ' + (error.message || 'Ukjent feil'))
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-12 text-center">
            <Text variant="body" className="mb-4">Kunde ikke funnet</Text>
            <Link href="/admin/customers">
              <Button variant="primary">Tilbake til kunder</Button>
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href={`/admin/customers/${customerId}/projects`}>
            <Button variant="secondary" size="sm">← Tilbake</Button>
          </Link>
        </div>

        <Card className="p-8">
          <Heading as="h1" size="lg" className="mb-6">Rediger Kunde</Heading>

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
                disabled={saving || !formData.name}
              >
                {saving ? 'Lagrer...' : 'Lagre endringer'}
              </Button>
              <Link href={`/admin/customers/${customerId}/projects`}>
                <Button type="button" variant="secondary">Avbryt</Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}


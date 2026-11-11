'use client'

import { PickerPackageItem } from '@/lib/actions/package-offers'
import { SalesFlyerPackageCategory } from '@/lib/types'
import { Button, Card, Heading, Text } from '@/components/ui'

const PACKAGE_CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
}

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

// Grupperer pr. kunde (null → "Interne pakker" alltid øverst, samme mønster som
// /admin/package-offers) slik at plukkeren ikke blander pakker fra ulike kunder
// om hverandre når listen vokser.
function groupByCustomer(packages: PickerPackageItem[]): { key: string; label: string; packages: PickerPackageItem[] }[] {
  const internal = packages.filter(p => p.customerName === null)
  const byCustomer = new Map<string, PickerPackageItem[]>()
  for (const p of packages) {
    if (p.customerName === null) continue
    const arr = byCustomer.get(p.customerName) ?? []
    arr.push(p)
    byCustomer.set(p.customerName, arr)
  }
  const customerGroups = Array.from(byCustomer.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'nb'))
    .map(([name, pkgs]) => ({ key: name, label: name, packages: pkgs }))
  return internal.length > 0
    ? [{ key: '__internal__', label: 'Interne pakker', packages: internal }, ...customerGroups]
    : customerGroups
}

interface PackagePickerModalProps {
  isOpen: boolean
  onClose: () => void
  allPackages: PickerPackageItem[]
  selectedPackageIds: string[]
  onToggleSelection: (packageId: string) => void
  onSave: () => void
}

export function PackagePickerModal({
  isOpen,
  onClose,
  allPackages,
  selectedPackageIds,
  onToggleSelection,
  onSave,
}: PackagePickerModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 sm:p-6 md:p-8 z-50">
      <Card className="max-w-3xl w-full max-h-[95vh] sm:max-h-[80vh] overflow-y-auto" data-lenis-prevent>
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading as="h2" size="md" className="mb-2">Velg pakker</Heading>
            <Text variant="muted">Klikk for å velge/fjerne. Pakkene vises i flyeren.</Text>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            style={{ color: '#62594E', lineHeight: 0, flexShrink: 0, marginLeft: 16 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          {groupByCustomer(allPackages).map(group => (
            <div key={group.key} className="mb-5 last:mb-0">
              <Text variant="small" className="text-xs uppercase tracking-wide opacity-60 mb-2">
                {group.label}
              </Text>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.packages.map((pkg) => {
                  const isSelected = selectedPackageIds.includes(pkg.id)
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => onToggleSelection(pkg.id)}
                      className={`cursor-pointer rounded-lg overflow-hidden transition bg-zinc-900 p-4 relative ${
                        isSelected
                          ? 'ring-2 ring-green-500'
                          : 'hover:ring-2 hover:ring-zinc-600'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                          ✓ Valgt
                        </div>
                      )}
                      <Heading as="h4" size="sm" className="text-sm mb-1 pr-16">
                        {pkg.label}
                      </Heading>
                      <Text variant="small" className="text-xs">
                        {PACKAGE_CATEGORY_LABEL[pkg.category]} · {formatNok(pkg.amount)}
                      </Text>
                      <Text variant="small" className="text-xs opacity-60">
                        {pkg.offerTitle}
                      </Text>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {allPackages.length === 0 && (
          <div className="text-center py-12">
            <Text variant="body">Ingen pakker er opprettet ennå</Text>
          </div>
        )}

        <div className="flex gap-4 pt-6 border-t border-zinc-800">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={onSave}
            variant="primary"
            className="flex-1"
            disabled={selectedPackageIds.length === 0}
          >
            Bruk valgte ({selectedPackageIds.length})
          </Button>
        </div>
      </Card>
    </div>
  )
}

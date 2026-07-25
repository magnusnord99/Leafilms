/**
 * Asserts buildContractTextWithAddons is idempotent across unsign→re-sign cycles.
 * Run: npx tsx scripts/assert-contract-addendum.ts
 */
import {
  buildContractTextWithAddons,
  stripPreviousAddonPatches,
} from '../lib/contract-addendum'

const baseNo = `4. Leveranse
Film og foto.

5. Økonomi
5.1 Totalpris er 50 000,- eks. mva. for leveransen.`

const baseEn = `4. Delivery
Film and photo.

5. Finances
5.1 The total price is 50 000,- excl. VAT for the delivery.`

const addons = [
  {
    description: 'Ekstra VFX',
    amounts: { production: 5000 },
    price: 5000,
    category: 'post' as const,
    discountable: true,
    deliveryImpact: '+ 10 bilder',
  },
]

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error('FAIL:', message)
    process.exit(1)
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

// Primary path (NO): patch once, then again on already-patched text (simulates unsign→resign).
const once = buildContractTextWithAddons(baseNo, 50000, addons, 0, 'no')
const twice = buildContractTextWithAddons(once, 50000, addons, 0, 'no')
assert(once === twice, 'NO primary path must be idempotent across re-patch')
assert(
  countOccurrences(twice, 'Følgende valgfrie tillegg inngår i totalsummen i punkt 5.1:') === 1,
  'NO addon listing must appear exactly once after re-patch'
)
assert(
  countOccurrences(twice, 'Følgende endringer i leveransen følger av valgte tillegg:') === 1,
  'NO delivery note must appear exactly once after re-patch'
)
assert(
  countOccurrences(twice, '+ 10 bilder') === 1,
  'NO delivery impact line must appear exactly once'
)

// English primary path
const onceEn = buildContractTextWithAddons(baseEn, 50000, addons, 0, 'en')
const twiceEn = buildContractTextWithAddons(onceEn, 50000, addons, 0, 'en')
assert(onceEn === twiceEn, 'EN primary path must be idempotent across re-patch')
assert(
  countOccurrences(twiceEn, 'The following optional add-ons are included in the total in section 5.1:') === 1,
  'EN addon listing must appear exactly once'
)

// Triple unsign→resign must not accumulate
const thrice = buildContractTextWithAddons(twice, 50000, addons, 0, 'no')
assert(thrice === once, 'Third re-patch must still equal first patch')

// Fallback path (no "eks. mva." / "excl. VAT" total anchor)
const fallbackBase = `Avtale om produksjon.\n\nIngen standard totalpris-klausul her.`
const fallbackOnce = buildContractTextWithAddons(fallbackBase, 50000, addons, 0, 'no')
const fallbackTwice = buildContractTextWithAddons(fallbackOnce, 50000, addons, 0, 'no')
assert(fallbackOnce === fallbackTwice, 'Fallback path must be idempotent')
assert(
  countOccurrences(fallbackTwice, 'Tillegg valgt av kunde ved signering:') === 1,
  'Fallback addon listing must appear exactly once'
)

// stripPreviousAddonPatches restores publishable base (modulo totalpris already patched)
const stripped = stripPreviousAddonPatches(once)
assert(
  !stripped.includes('Følgende valgfrie tillegg'),
  'strip must remove addon listing'
)
assert(
  !stripped.includes('Følgende endringer i leveransen'),
  'strip must remove delivery note'
)

console.log('assert-contract-addendum: all checks passed')

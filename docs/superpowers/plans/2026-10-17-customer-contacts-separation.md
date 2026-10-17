# Kunde/kontaktperson-separasjon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate `customers` (the account) from `customer_contacts` (the people), so a customer has one or more contact persons and exactly one of them is the "hovedkontakt" (primary contact) — instead of the current model where `customers.name`/`email`/`phone` conflate the account with a single person.

**Architecture:** One migration (`172_customer_account_only.sql`) backfills missing `customer_contacts` rows, moves the invoice-specific "Firma" field to a new `customers.invoice_company_name` column, collapses the display-name duplicate (`customers.company`) into `customers.name`, adds a trigger that guarantees exactly one `is_primary` row per customer, then drops `customers.email`/`phone`/`company`. Every TypeScript call site that reads/writes those three columns is updated to either read `customers.name` directly (account name) or join against `customer_contacts` for person-level data.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), TypeScript strict mode, Tailwind v4 (inline style objects in this codebase, not utility classes, for the files touched here).

**Spec:** `docs/superpowers/specs/2026-10-16-customer-contacts-separation-design.md`

## Global Constraints

- After migration 172 runs, `customers.name` is ALWAYS the account's display name (firm name if one exists, otherwise the private customer's name) — never a contact person's name.
- `customers.email`, `customers.phone`, `customers.company` no longer exist in the DB after migration 172 — never reintroduce a read or write to them. `customers.invoice_company_name` replaces `company`'s billing-specific use.
- Exactly one `customer_contacts` row per customer has `is_primary = true` — this is enforced by a DB trigger (`trg_single_primary_customer_contact`). Application code must never duplicate that unset-the-others logic; just set `is_primary: true` on the one you want and let the trigger do the rest.
- Migration 172 is **not auto-applied** (same pattern as every other migration in this repo, see `CLAUDE.md`'s "Uapplied migrasjoner" list) — the code written in this plan assumes the new schema and will not fully work until Magnus runs it manually. Task 1 adds it to that list.
- Follow existing conventions exactly: inline `style={{...}}` objects using the `C` theme token object (`@/lib/admin-theme`), no new UI libraries, no Tailwind utility classes added to files that don't already use them.
- This repo has no automated test suite (`package.json` has no test script). Verification per task is `npx tsc --noEmit` (must show no new errors) plus a stated manual check — this matches the project's actual conventions (see CLAUDE.md: "Type checking ... verifiserer kodekorrekthet, ikke feature-korrekthet").

## Review Focus

- A customer with zero `customer_contacts` rows (should be impossible after the migration 1 backfill, but a contact can later be deleted down to zero) — every `.find(c => c.is_primary)` must tolerate `null`/`undefined` and every consumer must handle "no primary contact" without crashing (Tasks 4, 18, 19, 20).
- Deleting the primary contact leaves a customer with zero `is_primary` rows (the trigger only fires on INSERT/UPDATE, not DELETE) — Task 4 auto-promotes another remaining contact when this happens.
- Creating a new customer in `ProjectForm.tsx`'s optional "Ny kunde" expansion with the contact-name field left blank must still produce exactly one `customer_contacts` row (falling back to the customer's own name), never zero (Task 10).
- A nested Supabase join like `customers(..., customer_contacts(...))` returns `customer_contacts` as an **array** on the joined row, never a single object — every new join added in this plan (Tasks 11, 18, 19, 20) must `.find(c => c.is_primary)` on that array, not index `[0]` or treat it as an object.
- Any leftover reference to `.company`/`.email`/`.phone` on a value typed as `Customer` (from `lib/types.ts`) must be a TypeScript compile error once Task 2 lands — `npx tsc --noEmit` after every later task is what catches this, which is why every task's last step runs it.

---

### Task 1: Migration — separate customers from customer_contacts

**Files:**
- Create: `supabase/migrations/172_customer_account_only.sql`
- Modify: `CLAUDE.md` (add migration 172 to the "Uapplied migrasjoner" list)

**Interfaces:**
- Produces: `customers.invoice_company_name` (nullable text, new column), `customers` without `email`/`phone`/`company`, a DB trigger `trg_single_primary_customer_contact` on `customer_contacts` that every later task relies on instead of writing its own "unset other primaries" logic.

- [ ] **Step 1: Write the migration file**

```sql
-- 172_customer_account_only.sql
-- Separerer customers (konto) fra customer_contacts (personer) fullstendig, se
-- docs/superpowers/specs/2026-10-16-customer-contacts-separation-design.md.
-- customers.name blir kontonavnet (firma, eller privatkundens navn); all
-- personspesifikk kontaktinfo bor i customer_contacts, med nøyaktig én
-- is_primary-rad per kunde garantert av triggeren under.

-- 1. Backfill manglende customer_contacts-rader — fanger opp kunder opprettet
-- via ProjectForm.tsx etter migrasjon 117, som aldri skrev til customer_contacts.
INSERT INTO customer_contacts (customer_id, name, email, phone, is_primary)
SELECT id, name, email, phone, true
FROM customers
WHERE NOT EXISTS (
  SELECT 1 FROM customer_contacts WHERE customer_contacts.customer_id = customers.id
);

-- 2. Flytt fakturarelevant "Firma" ut i en egen kolonne FØR company-feltet
-- droppes under — dette er et annet bruksområde enn visningsnavn-duplikatet i
-- steg 3 (se spec), satt ved kontraktsignering (app/api/contracts/sign/route.ts).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_company_name TEXT;
UPDATE customers SET invoice_company_name = company WHERE invoice_info_confirmed_at IS NOT NULL;

-- 3. Rett kontonavnet — kunder med firma får firmanavnet som kontonavn,
-- kunder uten firma beholder det eksisterende (person-)navnet.
UPDATE customers SET name = company WHERE company IS NOT NULL AND company != '';

-- 4. Garanter nøyaktig én hovedkontakt per kunde uansett hvor endringen skjer
-- (admin-UI, server action) — samme mønster som varseltriggerne i prosjektet.
CREATE OR REPLACE FUNCTION enforce_single_primary_customer_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE customer_contacts
    SET is_primary = false
    WHERE customer_id = NEW.customer_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_primary_customer_contact ON customer_contacts;
CREATE TRIGGER trg_single_primary_customer_contact
BEFORE INSERT OR UPDATE ON customer_contacts
FOR EACH ROW EXECUTE FUNCTION enforce_single_primary_customer_contact();

-- 5. customers representerer nå kun kontoen — all kontaktinfo bor i customer_contacts.
ALTER TABLE customers DROP COLUMN IF EXISTS email;
ALTER TABLE customers DROP COLUMN IF EXISTS phone;
ALTER TABLE customers DROP COLUMN IF EXISTS company;
```

- [ ] **Step 2: Add migration 172 to CLAUDE.md's "Uapplied migrasjoner" list**

Add this line to the bulleted list under `## Uapplied migrasjoner (blokkert)` in `CLAUDE.md` (keep existing entries untouched, append this one at the end of the list, before the "Disse er skrevet men ikke kjørt..." closing line):

```markdown
- `supabase/migrations/172_customer_account_only.sql` (separerer customers fra customer_contacts — se docs/superpowers/specs/2026-10-16-customer-contacts-separation-design.md. Før denne er kjørt: `customers.email`/`phone`/`company` finnes fortsatt i DB, men koden i appen er skrevet for å ikke bruke dem lenger — "Sett som hovedkontakt" fungerer, men uten garantien om nøyaktig én hovedkontakt siden DB-triggeren ikke finnes ennå)
```

- [ ] **Step 3: Verify the migration is syntactically sound (no DB to run it against yet)**

Run: `cat supabase/migrations/172_customer_account_only.sql | grep -c ';'`
Expected: a number > 0 (sanity check the file isn't empty/truncated — this migration is NOT run against Supabase as part of this plan, same as every other migration listed as "blokkert" in CLAUDE.md; Magnus runs it manually later).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/172_customer_account_only.sql CLAUDE.md
git commit -m "Legg til migrasjon 172: separer customers fra customer_contacts"
```

---

### Task 2: Update `lib/types.ts` — `Customer` and `ProjectWithPipeline`

**Files:**
- Modify: `lib/types.ts:44-61` (`Customer` type), `lib/types.ts:848-860` (`ProjectWithPipeline.customer`)

**Interfaces:**
- Consumes: nothing (pure type change).
- Produces: `Customer` without `email`/`phone`/`company`, with `invoice_company_name: string | null`. `ProjectWithPipeline.customer` without `company`/`email`/`phone`, with `invoice_company_name?: string | null`. Every later task that touches a `Customer`-typed or `ProjectWithPipeline['customer']`-typed value relies on this.

- [ ] **Step 1: Update the `Customer` type**

In `lib/types.ts`, replace:
```ts
export type Customer = {
  id: string
  name: string
  email: string | null
  company: string | null
  phone: string | null
  address: string | null
  notes: string | null
  customer_number: number
  org_nummer: string | null
  invoice_email: string | null
  invoice_reference: string | null
  invoice_info_skipped: boolean
  invoice_info_confirmed_at: string | null
  logo_path: string | null
  created_at: string
  updated_at: string
}
```
with:
```ts
export type Customer = {
  id: string
  name: string
  address: string | null
  notes: string | null
  customer_number: number
  org_nummer: string | null
  invoice_company_name: string | null
  invoice_email: string | null
  invoice_reference: string | null
  invoice_info_skipped: boolean
  invoice_info_confirmed_at: string | null
  logo_path: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Update `ProjectWithPipeline.customer`**

Replace:
```ts
  customer?: {
    id: string
    name: string
    company: string | null
    email?: string | null
    phone?: string | null
    org_nummer?: string | null
    address?: string | null
    invoice_email?: string | null
    invoice_reference?: string | null
    invoice_info_skipped?: boolean
    invoice_info_confirmed_at?: string | null
  } | null
```
with:
```ts
  customer?: {
    id: string
    name: string
    org_nummer?: string | null
    address?: string | null
    invoice_company_name?: string | null
    invoice_email?: string | null
    invoice_reference?: string | null
    invoice_info_skipped?: boolean
    invoice_info_confirmed_at?: string | null
  } | null
```

- [ ] **Step 3: Run the typecheck to see the full blast radius**

Run: `npx tsc --noEmit 2>&1 | tee /tmp/tsc-after-task2.txt | wc -l`
Expected: a large number of errors (every file this plan touches will show up here) — this is the worklist for Tasks 3-21. Do not try to fix them all now; each later task fixes its own file(s) and re-runs this check.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "Oppdater Customer/ProjectWithPipeline-typer for konto/kontakt-separasjon"
```

---

### Task 3: `lib/actions/customers.ts` — rename invoice `company` to `invoice_company_name`

**Files:**
- Modify: `lib/actions/customers.ts:6-13`

**Interfaces:**
- Consumes: `Customer` from Task 2.
- Produces: `CustomerInvoiceInfoPatch.invoice_company_name` — consumed by Tasks 7, 12, 21.

- [ ] **Step 1: Rename the field**

Replace:
```ts
export type CustomerInvoiceInfoPatch = {
  company?: string | null
  org_nummer?: string | null
  address?: string | null
  invoice_email?: string | null
  invoice_reference?: string | null
  invoice_info_skipped?: boolean
}
```
with:
```ts
export type CustomerInvoiceInfoPatch = {
  invoice_company_name?: string | null
  org_nummer?: string | null
  address?: string | null
  invoice_email?: string | null
  invoice_reference?: string | null
  invoice_info_skipped?: boolean
}
```

- [ ] **Step 2: Run typecheck scoped to this file's direct errors**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/customers.ts"`
Expected: no output (this file itself has no remaining errors — callers are fixed in Tasks 7, 12, 21).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/customers.ts
git commit -m "Rename fakturafeltet company til invoice_company_name"
```

---

### Task 4: `lib/actions/schedule-people.ts` — drop `company`, add `setPrimaryCustomerContact`, auto-promote on delete

**Files:**
- Modify: `lib/actions/schedule-people.ts:6-28` (`CustomerMatch`, `searchCustomers`), `lib/actions/schedule-people.ts:46-65` (`createCustomerContact`), `lib/actions/schedule-people.ts:81-90` (`deleteCustomerContact`)

**Interfaces:**
- Consumes: `CustomerContact` from `lib/types.ts` (unchanged).
- Produces: `CustomerMatch = { id: string; name: string }` (no `company`), `createCustomerContact(input)` accepting an optional `is_primary`, `setPrimaryCustomerContact(id): Promise<boolean>`, `deleteCustomerContact(id): Promise<boolean>` that auto-promotes another contact when the deleted one was primary. Consumed by Tasks 6, 10, 15 (PersonPicker).

- [ ] **Step 1: Drop `company` from `CustomerMatch` and `searchCustomers`**

Replace:
```ts
export type CustomerMatch = { id: string; name: string; company: string | null }
export type TeamMemberOption = { id: string; name: string; role: string; email: string | null; phone: string | null }

const now = () => new Date().toISOString()

export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  // Fjerner tegn som ville brutt PostgREST sin .or()-filterstreng-syntaks.
  const safe = query.trim().replace(/[,()%]/g, '')
  if (safe.length < 2) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, name, company')
      .or(`name.ilike.%${safe}%,company.ilike.%${safe}%`)
      .order('name')
      .limit(20)
    return (data ?? []) as CustomerMatch[]
  } catch (err) {
    console.error('searchCustomers:', err)
    return []
  }
}
```
with:
```ts
export type CustomerMatch = { id: string; name: string }
export type TeamMemberOption = { id: string; name: string; role: string; email: string | null; phone: string | null }

const now = () => new Date().toISOString()

export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  const safe = query.trim().replace(/[,()%]/g, '')
  if (safe.length < 2) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .ilike('name', `%${safe}%`)
      .order('name')
      .limit(20)
    return (data ?? []) as CustomerMatch[]
  } catch (err) {
    console.error('searchCustomers:', err)
    return []
  }
}
```

- [ ] **Step 2: Let `createCustomerContact` accept `is_primary`**

Replace:
```ts
export async function createCustomerContact(input: {
  customer_id: string; name: string; email?: string | null; phone?: string | null; role?: string | null
}): Promise<CustomerContact | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('customer_contacts').insert({
      customer_id: input.customer_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      is_primary: false,
    }).select('*').single()
    if (error) { console.error('createCustomerContact:', error); return null }
    return data as CustomerContact
  } catch (err) {
    console.error('createCustomerContact:', err)
    return null
  }
}
```
with:
```ts
export async function createCustomerContact(input: {
  customer_id: string; name: string; email?: string | null; phone?: string | null; role?: string | null; is_primary?: boolean
}): Promise<CustomerContact | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('customer_contacts').insert({
      customer_id: input.customer_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      is_primary: input.is_primary ?? false,
    }).select('*').single()
    if (error) { console.error('createCustomerContact:', error); return null }
    return data as CustomerContact
  } catch (err) {
    console.error('createCustomerContact:', err)
    return null
  }
}
```

- [ ] **Step 3: Add `setPrimaryCustomerContact` right after `updateCustomerContact`**

Insert this function after `updateCustomerContact` (before `deleteCustomerContact`):
```ts
export async function setPrimaryCustomerContact(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('customer_contacts')
      .update({ is_primary: true, updated_at: now() }).eq('id', id)
    return !error
  } catch (err) {
    console.error('setPrimaryCustomerContact:', err)
    return false
  }
}
```
(Relies on the Task 1 DB trigger to unset the previous primary — no app-level unset logic needed here.)

- [ ] **Step 4: Make `deleteCustomerContact` auto-promote another contact when the deleted one was primary**

Replace:
```ts
export async function deleteCustomerContact(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('customer_contacts').delete().eq('id', id)
    return !error
  } catch (err) {
    console.error('deleteCustomerContact:', err)
    return false
  }
}
```
with:
```ts
export async function deleteCustomerContact(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: deleted } = await supabase.from('customer_contacts').select('customer_id, is_primary').eq('id', id).single()
    const { error } = await supabase.from('customer_contacts').delete().eq('id', id)
    if (error) { console.error('deleteCustomerContact:', error); return false }

    // Hvis vi slettet hovedkontakten, forfrem en annen gjenværende kontakt (hvis noen
    // finnes) — uten dette ville kunden stå uten is_primary-rad i det hele tatt.
    if (deleted?.is_primary) {
      const { data: remaining } = await supabase
        .from('customer_contacts')
        .select('id')
        .eq('customer_id', deleted.customer_id)
        .limit(1)
        .maybeSingle()
      if (remaining) {
        await supabase.from('customer_contacts').update({ is_primary: true, updated_at: now() }).eq('id', remaining.id)
      }
    }
    return true
  } catch (err) {
    console.error('deleteCustomerContact:', err)
    return false
  }
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/schedule-people.ts"`
Expected: no output.

```bash
git add lib/actions/schedule-people.ts
git commit -m "Legg til setPrimaryCustomerContact og auto-forfremmelse ved sletting av hovedkontakt"
```

---

### Task 5: `app/admin/customers/new/page.tsx` — split into account + contact-person creation

**Files:**
- Modify: `app/admin/customers/new/page.tsx` (full rewrite of `formData` state and `handleSubmit`, plus the form JSX)

**Interfaces:**
- Consumes: nothing new (uses the raw `supabase` client directly, matching this file's existing pattern — it doesn't go through `lib/actions/customers.ts` or `schedule-people.ts`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace `formData` state**

Replace:
```ts
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    org_nummer: '',
    phone: '',
    address: '',
    notes: ''
  })
```
with:
```ts
  const [formData, setFormData] = useState({
    name: '',
    org_nummer: '',
    address: '',
    notes: '',
    contactName: '',
    contactRole: '',
    contactEmail: '',
    contactPhone: '',
  })
```

- [ ] **Step 2: Replace `handleSubmit` to insert both rows**

Replace:
```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([formData])
        .select()
        .single()

      if (error) throw error

      router.push(`/admin/customers/${data.id}`)
    } catch (err) {
      console.error('Error creating customer:', err)
      setError('Kunne ikke opprette kunde: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
      setLoading(false)
    }
  }
```
with:
```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert([{
          name: formData.name,
          org_nummer: formData.org_nummer || null,
          address: formData.address || null,
          notes: formData.notes || null,
        }])
        .select()
        .single()

      if (customerError) throw customerError

      const { error: contactError } = await supabase
        .from('customer_contacts')
        .insert([{
          customer_id: customer.id,
          name: formData.contactName,
          email: formData.contactEmail || null,
          phone: formData.contactPhone || null,
          role: formData.contactRole || null,
          is_primary: true,
        }])

      if (contactError) throw contactError

      router.push(`/admin/customers/${customer.id}`)
    } catch (err) {
      console.error('Error creating customer:', err)
      setError('Kunne ikke opprette kunde: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
      setLoading(false)
    }
  }
```

- [ ] **Step 3: Replace the "E-post" and "Firma" field blocks with a "Kontaktperson" fieldset**

Replace:
```tsx
          <div>
            {fieldLabel('E-post')}
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="kunde@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Firma')}
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Firmanavn"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Org.nummer')}
            <input
              type="text"
              value={formData.org_nummer}
              onChange={(e) => setFormData({ ...formData, org_nummer: e.target.value })}
              placeholder="923 456 789"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Telefon')}
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+47 123 45 678"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Adresse')}
```
with:
```tsx
          <div>
            {fieldLabel('Org.nummer')}
            <input
              type="text"
              value={formData.org_nummer}
              onChange={(e) => setFormData({ ...formData, org_nummer: e.target.value })}
              placeholder="923 456 789"
              style={inputStyle}
            />
          </div>

          <div style={{ padding: 16, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
              Kontaktperson
            </p>
            <div className="space-y-4">
              <div>
                {fieldLabel('Navn', true)}
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="Kontaktpersonens navn"
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  {fieldLabel('E-post')}
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="kontakt@bedrift.no"
                    style={inputStyle}
                  />
                </div>
                <div>
                  {fieldLabel('Telefon')}
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="+47 123 45 678"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                {fieldLabel('Rolle')}
                <input
                  type="text"
                  value={formData.contactRole}
                  onChange={(e) => setFormData({ ...formData, contactRole: e.target.value })}
                  placeholder="F.eks. Produsent"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div>
            {fieldLabel('Adresse')}
```

- [ ] **Step 4: Require a contact name before submit is enabled**

Replace both occurrences of `disabled={loading || !formData.name}` and the two `loading || !formData.name ? ... : ...` ternaries in the submit button with `loading || !formData.name || !formData.contactName`:

```tsx
            <button
              type="submit"
              disabled={loading || !formData.name || !formData.contactName}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: loading || !formData.name || !formData.contactName ? C.border : C.accent,
                color: loading || !formData.name || !formData.contactName ? C.text3 : C.bg,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: loading || !formData.name || !formData.contactName ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
```

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "customers/new/page.tsx"`
Expected: no output.

```bash
git add "app/admin/customers/new/page.tsx"
git commit -m "Del kundeopprettelse i konto-felt + kontaktperson-seksjon"
```

---

### Task 6: `app/admin/customers/[id]/edit/page.tsx` — remove account contact fields, add "set primary"

**Files:**
- Modify: `app/admin/customers/[id]/edit/page.tsx:7-8` (imports), `:49-57` (`formData` state), `:136-144` (`fetchCustomer`), `:327-369` (form JSX), `:393-442` (contact list JSX)

**Interfaces:**
- Consumes: `setPrimaryCustomerContact` from Task 4.

- [ ] **Step 1: Import `setPrimaryCustomerContact`**

Replace:
```ts
import { getCustomerContacts, createCustomerContact, updateCustomerContact, deleteCustomerContact } from '@/lib/actions/schedule-people'
```
with:
```ts
import { getCustomerContacts, createCustomerContact, updateCustomerContact, deleteCustomerContact, setPrimaryCustomerContact } from '@/lib/actions/schedule-people'
```

- [ ] **Step 2: Drop `email`/`company`/`phone` from `formData`**

Replace:
```ts
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    org_nummer: '',
    phone: '',
    address: '',
    notes: ''
  })
```
with:
```ts
  const [formData, setFormData] = useState({
    name: '',
    org_nummer: '',
    address: '',
    notes: ''
  })
```

- [ ] **Step 3: Drop them from `fetchCustomer`'s `loaded` object**

Replace:
```ts
      const loaded = {
        name: data.name || '',
        email: data.email || '',
        company: data.company || '',
        org_nummer: data.org_nummer || '',
        phone: data.phone || '',
        address: data.address || '',
        notes: data.notes || ''
      }
```
with:
```ts
      const loaded = {
        name: data.name || '',
        org_nummer: data.org_nummer || '',
        address: data.address || '',
        notes: data.notes || ''
      }
```

- [ ] **Step 4: Delete the "E-post" and "Firma" field blocks**

Delete these two blocks entirely (keep "Navn", "Org.nummer", "Telefon"... wait, "Telefon" is also account-level and must go too — delete it as well):

```tsx
          <div>
            {fieldLabel('E-post')}
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="kunde@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Firma')}
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Firmanavn"
              style={inputStyle}
            />
          </div>
```
(delete both, keep the "Org.nummer" block right after them unchanged) — and further down:
```tsx
          <div>
            {fieldLabel('Telefon')}
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+47 123 45 678"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Adresse')}
```
becomes just:
```tsx
          <div>
            {fieldLabel('Adresse')}
```
(delete the "Telefon" block, keep "Adresse" starting right after "Org.nummer").

- [ ] **Step 5: Add a "Sett som hovedkontakt" button to the contact list**

In the read-only contact row (inside `contacts.map`), replace:
```tsx
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button type="button" onClick={() => startEditContact(c)} style={{ fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Rediger</button>
                          <button type="button" onClick={() => handleDeleteContact(c.id)} style={{ fontSize: '0.65rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}>Slett</button>
                        </div>
```
with:
```tsx
                        <div style={{ display: 'flex', gap: 10 }}>
                          {!c.is_primary && (
                            <button type="button" onClick={() => handleSetPrimary(c.id)} style={{ fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Sett som hovedkontakt</button>
                          )}
                          <button type="button" onClick={() => startEditContact(c)} style={{ fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Rediger</button>
                          <button type="button" onClick={() => handleDeleteContact(c.id)} style={{ fontSize: '0.65rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}>Slett</button>
                        </div>
```

- [ ] **Step 6: Add the `handleSetPrimary` handler, and auto-refresh the list after delete**

Add this function right after `handleDeleteContact`:
```ts
  async function handleSetPrimary(id: string) {
    const ok = await setPrimaryCustomerContact(id)
    if (ok) setContacts(prev => prev.map(c => ({ ...c, is_primary: c.id === id })))
  }
```
And since `deleteCustomerContact` (Task 4) may now auto-promote another contact server-side, make `handleDeleteContact` re-fetch instead of just filtering the deleted one out of local state — replace:
```ts
  async function handleDeleteContact(id: string) {
    if (!confirm('Slette denne kontaktpersonen?')) return
    const ok = await deleteCustomerContact(id)
    if (ok) setContacts(prev => prev.filter(c => c.id !== id))
  }
```
with:
```ts
  async function handleDeleteContact(id: string) {
    if (!confirm('Slette denne kontaktpersonen?')) return
    const ok = await deleteCustomerContact(id)
    if (ok) {
      const fresh = await getCustomerContacts(customerId)
      setContacts(fresh)
    }
  }
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "customers/\[id\]/edit/page.tsx"`
Expected: no output.

```bash
git add "app/admin/customers/[id]/edit/page.tsx"
git commit -m "Fjern konto-nivå kontaktfelt, legg til Sett som hovedkontakt"
```

---

### Task 7: `app/admin/customers/[id]/page.tsx` — Kontaktinfo-boks + invoice_company_name

**Files:**
- Modify: `app/admin/customers/[id]/page.tsx:109-116` (`InvoiceInfoForm`), `:135` (initializer), `:479-508` (`handleOpenInvoiceEdit`/`handleSaveInvoiceInfo`), `:605-658` (header company display + Kontaktinfo box), `:1004-1058` (invoice edit field list + display)

**Interfaces:**
- Consumes: `CustomerInvoiceInfoPatch` from Task 3, `Customer` from Task 2.

- [ ] **Step 1: Rename the `InvoiceInfoForm` type and its initializer**

Replace:
```ts
type InvoiceInfoForm = {
  company: string
  org_nummer: string
  address: string
  invoice_email: string
  invoice_reference: string
  invoice_info_skipped: boolean
}
```
with:
```ts
type InvoiceInfoForm = {
  invoice_company_name: string
  org_nummer: string
  address: string
  invoice_email: string
  invoice_reference: string
  invoice_info_skipped: boolean
}
```
Replace:
```ts
  const [invoiceForm, setInvoiceForm] = useState<InvoiceInfoForm>({ company: '', org_nummer: '', address: '', invoice_email: '', invoice_reference: '', invoice_info_skipped: false })
```
with:
```ts
  const [invoiceForm, setInvoiceForm] = useState<InvoiceInfoForm>({ invoice_company_name: '', org_nummer: '', address: '', invoice_email: '', invoice_reference: '', invoice_info_skipped: false })
```

- [ ] **Step 2: Rename in `handleOpenInvoiceEdit` and `handleSaveInvoiceInfo`**

Replace:
```ts
  function handleOpenInvoiceEdit() {
    setInvoiceForm({
      company: customer?.company ?? '',
      org_nummer: customer?.org_nummer ?? '',
      address: customer?.address ?? '',
      invoice_email: customer?.invoice_email ?? '',
      invoice_reference: customer?.invoice_reference ?? '',
      invoice_info_skipped: !!customer?.invoice_info_skipped,
    })
    setInvoiceEdit(true)
  }

  async function handleSaveInvoiceInfo() {
    if (!customer) return
    setSavingInvoice(true)
    const patch = {
      company: invoiceForm.company.trim() || null,
      org_nummer: invoiceForm.org_nummer.trim() || null,
      address: invoiceForm.address.trim() || null,
      invoice_email: invoiceForm.invoice_email.trim() || null,
      invoice_reference: invoiceForm.invoice_reference.trim() || null,
      invoice_info_skipped: invoiceForm.invoice_info_skipped,
    }
```
with:
```ts
  function handleOpenInvoiceEdit() {
    setInvoiceForm({
      invoice_company_name: customer?.invoice_company_name ?? '',
      org_nummer: customer?.org_nummer ?? '',
      address: customer?.address ?? '',
      invoice_email: customer?.invoice_email ?? '',
      invoice_reference: customer?.invoice_reference ?? '',
      invoice_info_skipped: !!customer?.invoice_info_skipped,
    })
    setInvoiceEdit(true)
  }

  async function handleSaveInvoiceInfo() {
    if (!customer) return
    setSavingInvoice(true)
    const patch = {
      invoice_company_name: invoiceForm.invoice_company_name.trim() || null,
      org_nummer: invoiceForm.org_nummer.trim() || null,
      address: invoiceForm.address.trim() || null,
      invoice_email: invoiceForm.invoice_email.trim() || null,
      invoice_reference: invoiceForm.invoice_reference.trim() || null,
      invoice_info_skipped: invoiceForm.invoice_info_skipped,
    }
```
(the rest of `handleSaveInvoiceInfo` is unchanged).

- [ ] **Step 3: Remove the header's `customer.company` display**

Replace:
```tsx
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 300, fontStyle: 'italic', color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
              {customer.name}
            </h1>
            {customer.company && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>{customer.company}</span>
            )}
          </div>
```
with:
```tsx
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 300, fontStyle: 'italic', color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
              {customer.name}
            </h1>
          </div>
```

- [ ] **Step 4: Simplify the "Kontaktinfo" box to account-only fields**

Replace:
```tsx
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <InfoRow label="E-post" value={customer.email || '–'} />
              <InfoRow label="Telefon" value={customer.phone || '–'} />
              <InfoRow label="Adresse" value={customer.address || '–'} />
              <InfoRow label="Org.nummer" value={customer.org_nummer || '–'} />
            </div>
```
with:
```tsx
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <InfoRow label="Adresse" value={customer.address || '–'} />
              <InfoRow label="Org.nummer" value={customer.org_nummer || '–'} />
            </div>
```
(Contact-level email/phone are shown per-person in the "Kontaktpersoner" box right next to this one, which already works unchanged.)

- [ ] **Step 5: Rename `company` to `invoice_company_name` in the invoice edit field list and read-only display**

Replace:
```tsx
                {([
                  ['company', 'Firma'],
                  ['org_nummer', 'Org.nummer'],
                  ['address', 'Fakturaadresse'],
                  ['invoice_email', 'Faktura-e-post'],
                  ['invoice_reference', 'Merking / referanse'],
                ] as const).map(([key, label]) => (
```
with:
```tsx
                {([
                  ['invoice_company_name', 'Firma'],
                  ['org_nummer', 'Org.nummer'],
                  ['address', 'Fakturaadresse'],
                  ['invoice_email', 'Faktura-e-post'],
                  ['invoice_reference', 'Merking / referanse'],
                ] as const).map(([key, label]) => (
```
Replace:
```tsx
          ) : customer.company || customer.org_nummer || customer.address || customer.invoice_email || customer.invoice_reference ? (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {customer.company && <InfoRow label="Firma" value={customer.company} />}
```
with:
```tsx
          ) : customer.invoice_company_name || customer.org_nummer || customer.address || customer.invoice_email || customer.invoice_reference ? (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {customer.invoice_company_name && <InfoRow label="Firma" value={customer.invoice_company_name} />}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "customers/\[id\]/page.tsx"`
Expected: no output.

```bash
git add "app/admin/customers/[id]/page.tsx"
git commit -m "Fjern konto-nivå e-post/telefon, rename fakturafelt company"
```

---

### Task 8: `app/admin/customers/page.tsx` — list page via primary contact

**Files:**
- Modify: `app/admin/customers/page.tsx` (add `primaryContacts` state/fetch, update filter and row display)

**Interfaces:**
- Consumes: `Customer` from Task 2.

- [ ] **Step 1: Add primary-contact lookup state and fetch**

Replace:
```ts
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})

  async function fetchCustomers() {
    const supabase = createClient()
    const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
    setCustomers((data || []) as Customer[])
    setLoading(false)
  }

  async function fetchProjectCounts() {
    const supabase = createClient()
    const ids = customers.map(c => c.id)
    const { data } = await supabase.from('projects').select('customer_id').in('customer_id', ids)
    if (data) {
      const counts: Record<string, number> = {}
      data.forEach((p: { customer_id: string | null }) => { if (p.customer_id) counts[p.customer_id] = (counts[p.customer_id] || 0) + 1 })
      setProjectCounts(counts)
    }
  }

  useEffect(() => { fetchCustomers() }, [])

  useEffect(() => {
    if (customers.length > 0) fetchProjectCounts()
  }, [customers])
```
with:
```ts
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})
  const [primaryContacts, setPrimaryContacts] = useState<Record<string, { email: string | null; phone: string | null }>>({})

  async function fetchCustomers() {
    const supabase = createClient()
    const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
    setCustomers((data || []) as Customer[])
    setLoading(false)
  }

  async function fetchProjectCounts() {
    const supabase = createClient()
    const ids = customers.map(c => c.id)
    const { data } = await supabase.from('projects').select('customer_id').in('customer_id', ids)
    if (data) {
      const counts: Record<string, number> = {}
      data.forEach((p: { customer_id: string | null }) => { if (p.customer_id) counts[p.customer_id] = (counts[p.customer_id] || 0) + 1 })
      setProjectCounts(counts)
    }
  }

  async function fetchPrimaryContacts() {
    const supabase = createClient()
    const ids = customers.map(c => c.id)
    const { data } = await supabase.from('customer_contacts').select('customer_id, email, phone').in('customer_id', ids).eq('is_primary', true)
    if (data) {
      const map: Record<string, { email: string | null; phone: string | null }> = {}
      data.forEach(c => { map[c.customer_id] = { email: c.email, phone: c.phone } })
      setPrimaryContacts(map)
    }
  }

  useEffect(() => { fetchCustomers() }, [])

  useEffect(() => {
    if (customers.length > 0) { fetchProjectCounts(); fetchPrimaryContacts() }
  }, [customers])
```

- [ ] **Step 2: Update the search filter**

Replace:
```ts
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )
```
with:
```ts
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    primaryContacts[c.id]?.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )
```

- [ ] **Step 3: Update the row display**

Replace:
```tsx
                    {customer.company && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>
                        {customer.company}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
                    {customer.email && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{customer.email}</span>
                    )}
                    {customer.phone && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{customer.phone}</span>
                    )}
```
with:
```tsx
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
                    {primaryContacts[customer.id]?.email && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{primaryContacts[customer.id]?.email}</span>
                    )}
                    {primaryContacts[customer.id]?.phone && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{primaryContacts[customer.id]?.phone}</span>
                    )}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "admin/customers/page.tsx"`
Expected: no output.

```bash
git add app/admin/customers/page.tsx
git commit -m "Vis/søk kundelistens hovedkontakt i stedet for konto-nivå felt"
```

---

### Task 9: `app/admin/page.tsx` — dashboard display simplification

**Files:**
- Modify: `app/admin/page.tsx:467-469`

- [ ] **Step 1: Delete the company display block**

Replace:
```tsx
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 2 }}>
                          {customer.name}
                        </p>
                        {customer.company && (
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 6 }}>{customer.company}</p>
                        )}
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
```
with:
```tsx
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 2 }}>
                          {customer.name}
                        </p>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "app/admin/page.tsx"`
Expected: no output.

```bash
git add app/admin/page.tsx
git commit -m "Fjern company-visning fra dashboard-kundeliste"
```

---

### Task 10: `app/admin/projects/new/ProjectForm.tsx` — create contact alongside inline customer

**Files:**
- Modify: `app/admin/projects/new/ProjectForm.tsx:170` (`newCustomerInfo` state), `:344-360` (customer-insert block), `:953,962` (reset sites), `:971` (datalist), `:1003-1033` (new-customer field block)

**Interfaces:**
- Consumes: `Customer` from Task 2.

- [ ] **Step 1: Rename `newCustomerInfo.company` to `contactName`**

Replace:
```ts
  const [newCustomerInfo, setNewCustomerInfo] = useState({ company: '', email: '', phone: '' })
```
with:
```ts
  const [newCustomerInfo, setNewCustomerInfo] = useState({ contactName: '', email: '', phone: '' })
```
Find the two reset call sites (`onChange` of the customer-name input, and `onBlur` when it matches an existing customer) and replace both occurrences of:
```ts
                      setNewCustomerInfo({ company: '', email: '', phone: '' })
```
with:
```ts
                      setNewCustomerInfo({ contactName: '', email: '', phone: '' })
```

- [ ] **Step 2: Create a `customer_contacts` row when creating a new customer**

Replace:
```ts
        if (existingCustomer) {
          customerId = existingCustomer.id
          clientName = existingCustomer.name
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              name: customerInput.trim(),
              company: newCustomerInfo.company || customerInput.trim(),
              email: newCustomerInfo.email || null,
              phone: newCustomerInfo.phone || null,
            })
            .select()
            .single()

          if (!customerError) {
            customerId = newCustomer.id
            clientName = newCustomer.name
            setCustomers([...customers, newCustomer as Customer])
          }
        }
```
with:
```ts
        if (existingCustomer) {
          customerId = existingCustomer.id
          clientName = existingCustomer.name
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({ name: customerInput.trim() })
            .select()
            .single()

          if (!customerError) {
            customerId = newCustomer.id
            clientName = newCustomer.name
            setCustomers([...customers, newCustomer as Customer])

            const { error: contactError } = await supabase
              .from('customer_contacts')
              .insert({
                customer_id: newCustomer.id,
                name: newCustomerInfo.contactName.trim() || customerInput.trim(),
                email: newCustomerInfo.email || null,
                phone: newCustomerInfo.phone || null,
                is_primary: true,
              })
            if (contactError) console.error('ProjectForm: kunne ikke opprette kontaktperson for ny kunde', contactError)
          }
        }
```
(Review Focus: this guarantees a `customer_contacts` row even when `contactName` is left blank, by falling back to the typed customer name — never zero contacts.)

- [ ] **Step 3: Drop `customer.company` from the datalist option**

Replace:
```tsx
                  <datalist id="customers-list">
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.company ? `${customer.name} (${customer.company})` : customer.name}
                      </option>
                    ))}
                  </datalist>
```
with:
```tsx
                  <datalist id="customers-list">
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.name}
                      </option>
                    ))}
                  </datalist>
```

- [ ] **Step 4: Replace the "Firma" field with "Kontaktperson" in the new-customer expansion**

Replace:
```tsx
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          {fieldLabel('Firma')}
                          <input
                            type="text"
                            value={newCustomerInfo.company}
                            onChange={(e) => setNewCustomerInfo({ ...newCustomerInfo, company: e.target.value })}
                            placeholder="Firmanavn"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          {fieldLabel('E-post')}
```
with:
```tsx
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          {fieldLabel('Kontaktperson')}
                          <input
                            type="text"
                            value={newCustomerInfo.contactName}
                            onChange={(e) => setNewCustomerInfo({ ...newCustomerInfo, contactName: e.target.value })}
                            placeholder="Navn på kontaktperson"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          {fieldLabel('E-post')}
```

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "ProjectForm.tsx"`
Expected: no output.

```bash
git add "app/admin/projects/new/ProjectForm.tsx"
git commit -m "Opprett kontaktperson sammen med ny kunde i prosjekt-opprettelse"
```

---

### Task 11: `lib/actions/pipeline.ts` — all customer-join and display sites

**Files:**
- Modify: `lib/actions/pipeline.ts:17` (`CustomerJoin`), `:33-39` (`getProjectsForPipeline`), `:137-143` (`getHibernatingProjects`), `:799` (`getPostProdProjects`), `:848` (`getPostProdProject`), `:1000-1021` (`getProjectHub`), `:1200-1229` (`sendMeetingLink`), `:1667,1684,1708` (`getMyTasks`), `:1759-1813` (`generateEmailDraft`), `:2505-2521` (`getCustomersList`)

**Interfaces:**
- Consumes: `ProjectWithPipeline` from Task 2.
- Produces: `getCustomersList(): {id, name}[]` (no `company`) — consumed by Task 12.

- [ ] **Step 1: Drop `company` from `CustomerJoin`**

Replace:
```ts
type CustomerJoin = { id?: string; name: string | null; email?: string | null; company: string | null } | null
```
with:
```ts
type CustomerJoin = { id?: string; name: string | null } | null
```

- [ ] **Step 2: `getProjectsForPipeline` and `getHibernatingProjects` — drop `company` from the join**

In both functions, replace:
```
        customers (
          id,
          name,
          company
        )
```
with:
```
        customers (
          id,
          name
        )
```
(two occurrences, one per function — the surrounding `.select(...)` template literal and the rest of each function body are otherwise unchanged).

- [ ] **Step 3: `getPostProdProjects` and `getPostProdProject` — drop `company`**

Replace both occurrences of:
```ts
      .select(`*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)`)
```
with:
```ts
      .select(`*, customers(id, name), project_lead:profiles!project_lead_id(id, name, email)`)
```

- [ ] **Step 4: `getProjectHub` — drop `company`/`email`/`phone`, add `invoice_company_name`**

Replace:
```ts
        customers (
          id,
          name,
          company,
          email,
          phone,
          org_nummer,
          address,
          invoice_email,
          invoice_reference,
          invoice_info_skipped
        ),
```
with:
```ts
        customers (
          id,
          name,
          org_nummer,
          address,
          invoice_company_name,
          invoice_email,
          invoice_reference,
          invoice_info_skipped
        ),
```

- [ ] **Step 5: `sendMeetingLink` — join against the primary contact for the send-to email**

Replace:
```ts
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, customers(name, email, company)')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      console.error('sendMeetingLink project error:', projectError)
      return { success: false, error: 'Fant ikke prosjektet' }
    }

    const customer = project.customers ?? null
    const customerEmail: string | null = customer?.email ?? null
    const customerName: string = customer?.name ?? 'Kunde'
    const customerCompany: string = customer?.company ?? ''
```
with:
```ts
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, customers(name, customer_contacts(email, is_primary))')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      console.error('sendMeetingLink project error:', projectError)
      return { success: false, error: 'Fant ikke prosjektet' }
    }

    const customer = project.customers ?? null
    const primaryContact = (customer as { customer_contacts?: { email: string | null; is_primary: boolean }[] } | null)?.customer_contacts?.find(c => c.is_primary) ?? null
    const customerEmail: string | null = primaryContact?.email ?? null
    const customerName: string = customer?.name ?? 'Kunde'
```
Then in the prompt string right below, replace:
```ts
Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}
```
with:
```ts
Kunde: ${customerName}
```

- [ ] **Step 6: `getMyTasks` — drop `company` from the two inline types and the query**

Replace both occurrences of:
```ts
  project: { id: string; title: string; pipeline_stage: string; customer: { name: string; company: string | null } | null }
```
with:
```ts
  project: { id: string; title: string; pipeline_stage: string; customer: { name: string } | null }
```
Replace:
```ts
            customer:customers ( name, company )
```
with:
```ts
            customer:customers ( name )
```

- [ ] **Step 7: `generateEmailDraft` — drop `company`, simplify every `Kunde:` line**

Replace:
```ts
    .select('title, pipeline_stage, pipeline_data, customers(id, name, company)')
```
with:
```ts
    .select('title, pipeline_stage, pipeline_data, customers(id, name)')
```
Replace:
```ts
  const customer = (project as unknown as { customers?: CustomerJoin }).customers ?? null
  const customerName: string = customer?.name ?? 'Kunde'
  const customerCompany: string = customer?.company ?? ''
```
with:
```ts
  const customer = (project as unknown as { customers?: CustomerJoin }).customers ?? null
  const customerName: string = customer?.name ?? 'Kunde'
```
Then replace all 5 occurrences of the pattern `` `Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}` `` (one per `meeting`/`pitch`/`follow_up`/`general`/`delivery` prompt template) with `` `Kunde: ${customerName}` ``.

- [ ] **Step 8: `getCustomersList` — drop `company`**

Replace:
```ts
export async function getCustomersList(): Promise<{ id: string; name: string; company: string | null }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, company')
      .order('name', { ascending: true })
```
with:
```ts
export async function getCustomersList(): Promise<{ id: string; name: string }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name')
      .order('name', { ascending: true })
```

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/pipeline.ts"`
Expected: no output (callers in other files are fixed in later tasks — this step confirms `pipeline.ts` itself is clean).

```bash
git add lib/actions/pipeline.ts
git commit -m "Oppdater pipeline.ts: hovedkontakt-join i stedet for customers.company/email"
```

---

### Task 12: `app/admin/projects/[id]/page.tsx` — invoice rename + customer picker

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx:216-223` (`InvoiceInfoForm`), `:818-849` (`handleOpenInvoiceEdit`/`handleSaveInvoiceInfo`), `:865` (`handleSelectCustomer`), `:1337-1339` (customer display), `:1369-1387` (customer picker list), `:2510` (field tuple), `:2552-2558` (invoice display)

**Interfaces:**
- Consumes: `CustomerInvoiceInfoPatch` from Task 3, `getCustomersList` from Task 11.

- [ ] **Step 1: Rename `InvoiceInfoForm`**

Replace:
```ts
type InvoiceInfoForm = {
  company: string
  org_nummer: string
  address: string
  invoice_email: string
  invoice_reference: string
  invoice_info_skipped: boolean
}
```
with:
```ts
type InvoiceInfoForm = {
  invoice_company_name: string
  org_nummer: string
  address: string
  invoice_email: string
  invoice_reference: string
  invoice_info_skipped: boolean
}
```

- [ ] **Step 2: Rename in `handleOpenInvoiceEdit`/`handleSaveInvoiceInfo`**

Replace:
```ts
  function handleOpenInvoiceEdit() {
    const customer = project.customer
    setInvoiceForm({
      company: customer?.company ?? '',
      org_nummer: customer?.org_nummer ?? '',
      address: customer?.address ?? '',
      invoice_email: customer?.invoice_email ?? '',
      invoice_reference: customer?.invoice_reference ?? '',
      invoice_info_skipped: !!customer?.invoice_info_skipped,
    })
    setInvoiceEdit(true)
  }

  async function handleSaveInvoiceInfo() {
    const customerId = project.customer?.id
    if (!customerId) return
    setSavingInvoice(true)
    const patch = {
      company: invoiceForm.company.trim() || null,
```
with:
```ts
  function handleOpenInvoiceEdit() {
    const customer = project.customer
    setInvoiceForm({
      invoice_company_name: customer?.invoice_company_name ?? '',
      org_nummer: customer?.org_nummer ?? '',
      address: customer?.address ?? '',
      invoice_email: customer?.invoice_email ?? '',
      invoice_reference: customer?.invoice_reference ?? '',
      invoice_info_skipped: !!customer?.invoice_info_skipped,
    })
    setInvoiceEdit(true)
  }

  async function handleSaveInvoiceInfo() {
    const customerId = project.customer?.id
    if (!customerId) return
    setSavingInvoice(true)
    const patch = {
      invoice_company_name: invoiceForm.invoice_company_name.trim() || null,
```

- [ ] **Step 3: `handleSelectCustomer` — drop `company` from the optimistic update**

Replace:
```ts
      setHubData(prev => prev ? { ...prev, project: { ...prev.project, customer_id: customerId, customer: picked ? { id: picked.id, name: picked.name, company: picked.company } : prev.project.customer } } : prev)
```
with:
```ts
      setHubData(prev => prev ? { ...prev, project: { ...prev.project, customer_id: customerId, customer: picked ? { id: picked.id, name: picked.name } : prev.project.customer } } : prev)
```

- [ ] **Step 4: Customer display + picker — drop `company`**

Replace:
```tsx
                {project.customer && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                    {project.customer.name}{project.customer.company ? ` — ${project.customer.company}` : ''}
                  </p>
                )}
```
with:
```tsx
                {project.customer && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                    {project.customer.name}
                  </p>
                )}
```
Replace:
```tsx
                    {customerOptions
                      .filter(c => `${c.name} ${c.company ?? ''}`.toLowerCase().includes(customerSearch.toLowerCase()))
```
with:
```tsx
                    {customerOptions
                      .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
```
Replace:
```tsx
                          {c.name}{c.company ? ` — ${c.company}` : ''}
                          {c.id === project.customer_id && <span style={{ marginLeft: 8, color: C.accent }}>✓</span>}
```
with:
```tsx
                          {c.name}
                          {c.id === project.customer_id && <span style={{ marginLeft: 8, color: C.accent }}>✓</span>}
```

- [ ] **Step 5: Invoice field tuple + display — rename `company`**

Replace:
```tsx
                      ['company', 'Firma'],
```
with:
```tsx
                      ['invoice_company_name', 'Firma'],
```
Replace:
```tsx
                ) : project.customer.company || project.customer.org_nummer || project.customer.address || project.customer.invoice_email || project.customer.invoice_reference ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {project.customer.company && <InvoiceInfoLine label="Firma" value={project.customer.company} />}
```
with:
```tsx
                ) : project.customer.invoice_company_name || project.customer.org_nummer || project.customer.address || project.customer.invoice_email || project.customer.invoice_reference ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {project.customer.invoice_company_name && <InvoiceInfoLine label="Firma" value={project.customer.invoice_company_name} />}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "projects/\[id\]/page.tsx"`
Expected: no output.

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "Rename fakturafelt company, forenkle kundevelger uten company"
```

---

### Task 13: `app/admin/faktura/[id]/page.tsx` — invoice rename

**Files:**
- Modify: `app/admin/faktura/[id]/page.tsx:131,285`

- [ ] **Step 1: Rename both references**

Replace:
```ts
  const hasInvoiceInfo = !!(customer?.company || customer?.org_nummer || customer?.address || customer?.invoice_email)
```
with:
```ts
  const hasInvoiceInfo = !!(customer?.invoice_company_name || customer?.org_nummer || customer?.address || customer?.invoice_email)
```
Replace:
```tsx
              {customer?.company && <InfoLine label="Firma" value={customer.company} />}
```
with:
```tsx
              {customer?.invoice_company_name && <InfoLine label="Firma" value={customer.invoice_company_name} />}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "faktura/\[id\]/page.tsx"`
Expected: no output.

```bash
git add "app/admin/faktura/[id]/page.tsx"
git commit -m "Rename fakturafelt company til invoice_company_name"
```

---

### Task 14: `app/admin/projects/[id]/email/page.tsx` — drop `customerCompany`

**Files:**
- Modify: `app/admin/projects/[id]/email/page.tsx:434,452-454`

- [ ] **Step 1: Delete the `customerCompany` derivation and simplify the header**

Replace:
```ts
  const customerName = project.customer?.name ?? ''
  const customerCompany = (project.customer as { company?: string | null } | null)?.company ?? ''
```
with:
```ts
  const customerName = project.customer?.name ?? ''
```
Replace:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {customerName && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>{customerName}</span>}
            {customerName && customerCompany && <span style={{ color: C.text3, fontSize: '0.55rem' }}>·</span>}
            {customerCompany && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>{customerCompany}</span>}
          </div>
```
with:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {customerName && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>{customerName}</span>}
          </div>
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "projects/\[id\]/email/page.tsx"`
Expected: no output.

```bash
git add "app/admin/projects/[id]/email/page.tsx"
git commit -m "Fjern customerCompany fra e-post-sidens header"
```

---

### Task 15: Display-simplification pass — BoardView, ListView, postprod/preprod, transfers, QuoteBuilder, PersonPicker

**Files:**
- Modify: `app/admin/projects/BoardView.tsx:978-980`, `app/admin/projects/ListView.tsx:47-48,121-131,206`, `app/admin/postprod/page.tsx:50`, `app/admin/preprod/page.tsx:43`, `app/admin/postprod/[id]/page.tsx:1017`, `app/admin/email/page.tsx:114-116`, `app/admin/transfers/new/page.tsx:58`, `components/quote/QuoteBuilder.tsx:339-341,386-388`, `components/boards/nodes/schedule/PersonPicker.tsx:112`

**Interfaces:**
- Consumes: `CustomerMatch` from Task 4 (for `PersonPicker.tsx`), `ProjectWithPipeline` from Task 2 (for the rest).

- [ ] **Step 1: `BoardView.tsx` — drop company suffix**

Replace:
```tsx
            {project.customer.name}{project.customer.company ? ` · ${project.customer.company}` : ''}
```
with:
```tsx
            {project.customer.name}
```

- [ ] **Step 2: `ListView.tsx` — remove `customer_company` entirely**

Replace:
```ts
  customer_name: string | null
  customer_company: string | null
```
with:
```ts
  customer_name: string | null
```
Replace:
```
            customers(name, company),
```
with:
```
            customers(name),
```
Replace:
```ts
      type RawProject = Omit<ProjectRow, 'customer_name' | 'customer_company' | 'project_lead_name'> & {
        customers: { name: string | null; company: string | null } | null
        project_lead: { name: string | null; email: string } | null
      }
      const rawProjects = (projectsRes.data ?? []) as unknown as RawProject[]

      setProjects(rawProjects.map(p => ({
        ...p,
        customers: undefined,
        customer_name: p.customers?.name ?? null,
        customer_company: p.customers?.company ?? null,
        project_lead: undefined,
```
with:
```ts
      type RawProject = Omit<ProjectRow, 'customer_name' | 'project_lead_name'> & {
        customers: { name: string | null } | null
        project_lead: { name: string | null; email: string } | null
      }
      const rawProjects = (projectsRes.data ?? []) as unknown as RawProject[]

      setProjects(rawProjects.map(p => ({
        ...p,
        customers: undefined,
        customer_name: p.customers?.name ?? null,
        project_lead: undefined,
```
Replace:
```ts
        customer: rep.customer_company || rep.customer_name || rep.client_name,
```
with:
```ts
        customer: rep.customer_name || rep.client_name,
```

- [ ] **Step 3: `postprod/page.tsx`, `preprod/page.tsx`, `postprod/[id]/page.tsx` — drop company suffix**

In `app/admin/postprod/page.tsx`, replace:
```tsx
                {project.customer.name}{project.customer.company ? ` · ${project.customer.company}` : ''}
```
with:
```tsx
                {project.customer.name}
```
In `app/admin/preprod/page.tsx`, replace the identical pattern (same line shape) the same way.
In `app/admin/postprod/[id]/page.tsx`, replace:
```tsx
                    {currentProject.customer.name}{currentProject.customer.company ? ` — ${currentProject.customer.company}` : ''}
```
with:
```tsx
                    {currentProject.customer.name}
```

- [ ] **Step 4: `admin/email/page.tsx` — drop company line**

Replace:
```tsx
        {project.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 5 }}>
            {project.customer.name}
            {project.customer.company ? ` · ${project.customer.company}` : ''}
          </p>
        )}
```
with:
```tsx
        {project.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 5 }}>
            {project.customer.name}
          </p>
        )}
```

- [ ] **Step 5: `transfers/new/page.tsx` — drop company fragment**

Replace:
```tsx
            Til {project.customer.name}{project.customer.company ? ` — ${project.customer.company}` : ''}
            {project.customer.email ? ` · ${project.customer.email}` : ''}
```
with:
```tsx
            Til {project.customer.name}
            {project.customer.email ? ` · ${project.customer.email}` : ''}
```
(`project.customer.email` here now comes from Task 19's primary-contact join inside `getProjectForTransfer` — no change needed to how this file reads it.)

- [ ] **Step 6: `QuoteBuilder.tsx` — drop `company` from filter and display**

Replace:
```ts
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  )
```
with:
```ts
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )
```
Replace:
```tsx
                {c.customer_number && <span style={{ color: C.accent, marginLeft: 8, fontSize: '0.72rem' }}>#{c.customer_number}</span>}
                {c.company && <span style={{ color: C.text2, marginLeft: 8, fontSize: '0.72rem' }}>{c.company}</span>}
```
with:
```tsx
                {c.customer_number && <span style={{ color: C.accent, marginLeft: 8, fontSize: '0.72rem' }}>#{c.customer_number}</span>}
```

- [ ] **Step 7: `PersonPicker.tsx` (schedule) — drop `company` (now gone from `CustomerMatch`)**

Replace:
```tsx
                {c.name}{c.company ? ` · ${c.company}` : ''}
```
with:
```tsx
                {c.name}
```

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "BoardView.tsx|ListView.tsx|postprod/page.tsx|preprod/page.tsx|postprod/\[id\]/page.tsx|admin/email/page.tsx|transfers/new/page.tsx|QuoteBuilder.tsx|PersonPicker.tsx"`
Expected: no output.

```bash
git add app/admin/projects/BoardView.tsx app/admin/projects/ListView.tsx app/admin/postprod/page.tsx app/admin/preprod/page.tsx "app/admin/postprod/[id]/page.tsx" app/admin/email/page.tsx app/admin/transfers/new/page.tsx components/quote/QuoteBuilder.tsx components/boards/nodes/schedule/PersonPicker.tsx
git commit -m "Forenkle kunde-visning uten company på tvers av prosjekt-/leveranse-sider"
```

---

### Task 16: `lib/calendar-label.ts`, `lib/actions/calendar.ts`, `lib/ics-feed.ts`

**Files:**
- Modify: `lib/calendar-label.ts:5-7`, `lib/actions/calendar.ts:48`, `lib/ics-feed.ts:165`

- [ ] **Step 1: Simplify `companyLabel`**

Replace:
```ts
export function companyLabel(customer: { name: string | null; company?: string | null } | null | undefined): string | null {
  return customer?.company || customer?.name || null
}
```
with:
```ts
export function companyLabel(customer: { name: string | null } | null | undefined): string | null {
  return customer?.name || null
}
```

- [ ] **Step 2: Drop `company` from the two queries that select it for this function**

In `lib/actions/calendar.ts`, replace:
```ts
          project:projects ( id, title, pipeline_stage, customers(name, company) )
```
with:
```ts
          project:projects ( id, title, pipeline_stage, customers(name) )
```
In `lib/ics-feed.ts`, replace:
```ts
      .select('id, title, pipeline_stage, due_date, calendar_name, project_id, project:projects(title, customers(name, company))')
```
with:
```ts
      .select('id, title, pipeline_stage, due_date, calendar_name, project_id, project:projects(title, customers(name))')
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "calendar-label.ts|actions/calendar.ts|ics-feed.ts"`
Expected: no output.

```bash
git add lib/calendar-label.ts lib/actions/calendar.ts lib/ics-feed.ts
git commit -m "Forenkle companyLabel uten customers.company"
```

---

### Task 17: `lib/actions/boards.ts` — 5 display sites + default-to-primary on the live board

**Files:**
- Modify: `lib/actions/boards.ts:139,150,169` (`getBoardData`), `:258,261,269` (`getScheduleCardData`), `:309,312,320` (`getSharedScheduleCard`), `:1144,1152,1195` (`getSharedBoard`), `:1232,1249,1256` (`getAllBoards`)

**Interfaces:**
- Consumes: `CustomerContact` from `lib/types.ts` (unchanged).

- [ ] **Step 1: Drop `company` from all 5 `customers(name, company)` selects and their derived `customer?.name || customer?.company` fallback**

This is the identical mechanical change in 5 places. For each of the 5 functions, find the `customers(name, company)` (or `customers(..., customers(name, company))` for `getAllBoards`) in its `.select(...)` and replace `name, company` with just `name`; find the matching inline cast type `{ name: string | null; company: string | null } | null` and replace with `{ name: string | null } | null`; find `customer?.name || customer?.company || 'Ingen kunde satt'` and replace with `customer?.name || 'Ingen kunde satt'`.

Concretely, in `getBoardData` (around line 139), replace:
```ts
      supabase.from('projects').select('id, title, customer_id, board_summary, delivery_description, delivery_video, delivery_photo, shoot_start, shoot_end, customers(name, company)').eq('id', board.project_id).single(),
```
with:
```ts
      supabase.from('projects').select('id, title, customer_id, board_summary, delivery_description, delivery_video, delivery_photo, shoot_start, shoot_end, customers(name)').eq('id', board.project_id).single(),
```
and (same function, a few lines down):
```ts
    const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null } | null)?.customers
```
with:
```ts
    const customer = (project as unknown as { customers?: { name: string | null } | null } | null)?.customers
```
and:
```ts
      customerName: customer?.name || customer?.company || 'Ingen kunde satt',
```
with:
```ts
      customerName: customer?.name || 'Ingen kunde satt',
```

Repeat the same three substitutions in `getScheduleCardData` (`customers(name, company)` → `customers(name)` in its `.select('id, title, shoot_start, shoot_end, customers(name, company))'`, same cast-type and fallback changes), `getSharedScheduleCard` (identical shape), `getSharedBoard` (its select is `'title, board_summary, delivery_description, delivery_video, delivery_photo, shoot_start, shoot_end, language, customers(name, company)'`), and `getAllBoards` (its select is `'id, title, project_id, share_token, updated_at, projects(title, customers(name, company))'`, and its cast is `{ title: string; customers?: { name: string | null; company: string | null } | null } | null`).

- [ ] **Step 2: In `getBoardData`, fall back to the customer's primary contact when no board-level contact is set**

Replace:
```ts
    const [{ data: cards }, { data: edges }, { data: project }, { data: leadProfile }, { data: customerContact }, comments] = await Promise.all([
      supabase.from('board_cards').select('*').eq('board_id', boardId).order('z_index'),
      supabase.from('board_edges').select('*').eq('board_id', boardId),
      supabase.from('projects').select('id, title, customer_id, board_summary, delivery_description, delivery_video, delivery_photo, shoot_start, shoot_end, customers(name)').eq('id', board.project_id).single(),
      board.lead_profile_id
        ? supabase.from('profiles').select('id, name, email, color, phone').eq('id', board.lead_profile_id).maybeSingle()
        : Promise.resolve({ data: null }),
      board.customer_contact_id
        ? supabase.from('customer_contacts').select('id, name, role, phone').eq('id', board.customer_contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      getBoardComments(boardId),
    ])
```
with:
```ts
    const [{ data: cards }, { data: edges }, { data: project }, { data: leadProfile }, comments] = await Promise.all([
      supabase.from('board_cards').select('*').eq('board_id', boardId).order('z_index'),
      supabase.from('board_edges').select('*').eq('board_id', boardId),
      supabase.from('projects').select('id, title, customer_id, board_summary, delivery_description, delivery_video, delivery_photo, shoot_start, shoot_end, customers(name)').eq('id', board.project_id).single(),
      board.lead_profile_id
        ? supabase.from('profiles').select('id, name, email, color, phone').eq('id', board.lead_profile_id).maybeSingle()
        : Promise.resolve({ data: null }),
      getBoardComments(boardId),
    ])

    const projectCustomerIdForContact = (project as unknown as { customer_id?: string | null } | null)?.customer_id ?? null
    const { data: customerContact } = board.customer_contact_id
      ? await supabase.from('customer_contacts').select('id, name, role, phone').eq('id', board.customer_contact_id).maybeSingle()
      : projectCustomerIdForContact
        ? await supabase.from('customer_contacts').select('id, name, role, phone').eq('customer_id', projectCustomerIdForContact).eq('is_primary', true).maybeSingle()
        : { data: null }
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/boards.ts"`
Expected: no output.

```bash
git add lib/actions/boards.ts
git commit -m "Forenkle customerName uten company, default kundekontakt til hovedkontakt"
```

---

### Task 18: `lib/actions/contracts.ts` — primary contact for `kunde_kontakt`

**Files:**
- Modify: `lib/actions/contracts.ts:68,117,150-152`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Join `customer_contacts` and resolve the primary contact**

Replace:
```ts
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*, customers(*)')
    .eq('id', projectId)
    .single()
```
with:
```ts
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*, customers(*, customer_contacts(name, email, is_primary))')
    .eq('id', projectId)
    .single()
```
Replace:
```ts
  const customer = (project as unknown as { customers?: { name: string | null; company: string | null; org_nummer: string | null } | null }).customers ?? null
```
with:
```ts
  const customer = (project as unknown as { customers?: { name: string | null; org_nummer: string | null; customer_contacts?: { name: string | null; email: string | null; is_primary: boolean }[] } | null }).customers ?? null
  const primaryContact = customer?.customer_contacts?.find(c => c.is_primary) ?? null
```

- [ ] **Step 2: Fix `autoVars` — `bedrift` no longer needs a fallback chain, `kunde_kontakt` must use the primary contact**

Replace:
```ts
  const autoVars = {
    bedrift: customer?.company || customer?.name || '',
    kunde_kontakt: customer?.name || '',
```
with:
```ts
  const autoVars = {
    bedrift: customer?.name || '',
    kunde_kontakt: primaryContact?.name || customer?.name || '',
```
(Review Focus: before this migration, `customer?.name` WAS the contact's name, so `kunde_kontakt` happened to be correct by accident. After the migration `name` is the account name, so this fallback chain — primary contact first, account name only if there's no contact at all — is required to keep the contract's "kunde_kontakt" variable showing an actual person.)

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/contracts.ts"`
Expected: no output.

```bash
git add lib/actions/contracts.ts
git commit -m "Bruk hovedkontakt for kunde_kontakt i kontraktgenerering"
```

---

### Task 19: `lib/actions/transfers.ts` — `getProjectForTransfer` via primary contact

**Files:**
- Modify: `lib/actions/transfers.ts:22-77`

- [ ] **Step 1: Update the type, query, and body**

Replace:
```ts
export type ProjectForTransfer = {
  id: string
  title: string
  language: 'no' | 'en'
  customer: {
    id: string
    name: string
    company: string | null
    email: string | null
    logo_path: string | null
  } | null
  deliverables: Array<{
    name?: string
    quantity?: number | null
    format?: string
    description?: string
  }>
}

// Henter prosjekt + kunde + leveranseinfo for pre-utfylling av leveringssiden
export async function getProjectForTransfer(projectId: string): Promise<ProjectForTransfer | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, title, language, deliverables,
      customers (id, name, company, email, logo_path)
    `)
    .eq('id', projectId)
    .single()

  if (!project) return null

  const deliverables = (project as { deliverables?: ProjectForTransfer['deliverables'] }).deliverables ?? []

  const customer = Array.isArray(project.customers)
    ? project.customers[0] ?? null
    : (project.customers as ProjectForTransfer['customer'] | null)

  return {
    id: project.id,
    title: project.title,
    language: (project as { language?: string }).language === 'en' ? 'en' : 'no',
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      company: customer.company ?? null,
      email: customer.email ?? null,
      logo_path: customer.logo_path ?? null,
    } : null,
    deliverables,
  }
}
```
with:
```ts
export type ProjectForTransfer = {
  id: string
  title: string
  language: 'no' | 'en'
  customer: {
    id: string
    name: string
    email: string | null
    logo_path: string | null
  } | null
  deliverables: Array<{
    name?: string
    quantity?: number | null
    format?: string
    description?: string
  }>
}

type TransferCustomerRow = {
  id: string
  name: string
  logo_path: string | null
  customer_contacts?: { email: string | null; is_primary: boolean }[]
}

// Henter prosjekt + kunde + leveranseinfo for pre-utfylling av leveringssiden
export async function getProjectForTransfer(projectId: string): Promise<ProjectForTransfer | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, title, language, deliverables,
      customers (id, name, logo_path, customer_contacts(email, is_primary))
    `)
    .eq('id', projectId)
    .single()

  if (!project) return null

  const deliverables = (project as { deliverables?: ProjectForTransfer['deliverables'] }).deliverables ?? []

  const customer = Array.isArray(project.customers)
    ? (project.customers[0] as TransferCustomerRow | undefined) ?? null
    : (project.customers as TransferCustomerRow | null)
  const primaryContact = customer?.customer_contacts?.find(c => c.is_primary) ?? null

  return {
    id: project.id,
    title: project.title,
    language: (project as { language?: string }).language === 'en' ? 'en' : 'no',
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      email: primaryContact?.email ?? null,
      logo_path: customer.logo_path ?? null,
    } : null,
    deliverables,
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/transfers.ts"`
Expected: no output. Also confirm no other file needs changes: `grep -n "ProjectForTransfer\['customer'\]\|\.customer\.company" app/admin/transfers/new/TransferUploadClient.tsx` should return nothing (this file only ever read `.email`/`.name`, which keep the same shape).

```bash
git add lib/actions/transfers.ts
git commit -m "Hent leveransekundens e-post fra hovedkontakt i stedet for customers.email"
```

---

### Task 20: `lib/actions/production-chat.ts` — `getProductionInfo` via primary contact

**Files:**
- Modify: `lib/actions/production-chat.ts:33-56`

- [ ] **Step 1: Update the query and body (the `ProductionInfo.customer` type stays the same shape — only its source changes)**

Replace:
```ts
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id, title, shoot_start, shoot_end, shoot_confirmed, pipeline_stage, pipeline_data, deliverables,
        customers (name, email, phone, address),
        project_lead:profiles!project_lead_id (id, name, email)
      `)
      .eq('id', projectId)
      .single()

    if (error || !project) return null

    const customer = Array.isArray(project.customers) ? project.customers[0] ?? null : project.customers
```
with:
```ts
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id, title, shoot_start, shoot_end, shoot_confirmed, pipeline_stage, pipeline_data, deliverables,
        customers (name, address, customer_contacts(email, phone, is_primary)),
        project_lead:profiles!project_lead_id (id, name, email)
      `)
      .eq('id', projectId)
      .single()

    if (error || !project) return null

    type RawCustomer = { name: string; address: string | null; customer_contacts?: { email: string | null; phone: string | null; is_primary: boolean }[] }
    const rawCustomer = (Array.isArray(project.customers) ? project.customers[0] ?? null : project.customers) as RawCustomer | null
    const primaryContact = rawCustomer?.customer_contacts?.find(c => c.is_primary) ?? null
    const customer = rawCustomer ? { name: rawCustomer.name, email: primaryContact?.email ?? null, phone: primaryContact?.phone ?? null, address: rawCustomer.address } : null
```
(the `return { ..., customer, ... }` line below is unchanged — `customer` keeps the exact same `{name, email, phone, address}` shape `ProductionInfo.customer` already expects, so `app/admin/produksjon/[id]/page.tsx` needs zero changes).

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/production-chat.ts"`
Expected: no output.

```bash
git add lib/actions/production-chat.ts
git commit -m "Hent produksjonsinfo-kontakt fra customer_contacts i stedet for customers.email/phone"
```

---

### Task 21: `app/api/contracts/sign/route.ts` — write to `invoice_company_name`

**Files:**
- Modify: `app/api/contracts/sign/route.ts:205`

- [ ] **Step 1: Rename the write**

Replace:
```ts
          if (invoiceCompany?.trim()) customerUpdate.company = invoiceCompany.trim()
```
with:
```ts
          if (invoiceCompany?.trim()) customerUpdate.invoice_company_name = invoiceCompany.trim()
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep "contracts/sign/route.ts"`
Expected: no output.

```bash
git add app/api/contracts/sign/route.ts
git commit -m "Skriv invoice_company_name ved kontraktsignering i stedet for company"
```

---

### Task 22: Final full-project check and manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full project typecheck**

Run: `npx tsc --noEmit`
Expected: no output at all (every error introduced by Task 2's type change must have been resolved by Tasks 3-21).

- [ ] **Step 2: Grep sweep for anything missed**

Run: `grep -rn "customer\.company\|customer?\.company\|customers\.company\|\.company,\|company:" --include="*.ts" --include="*.tsx" app lib | grep -vi "lead\|invoice_company_name"`
Expected: no output (anything matching here is a missed `customers.company` reference — if something shows up, fix it as part of this task and re-run Step 1).

- [ ] **Step 3: Manual test — new customer with contact, via admin**

Start the dev server (`npm run dev`), go to `/admin/customers/new`, fill in account name + contact person name, submit. Confirm the new customer detail page shows the contact in "Kontaktpersoner" with a "Primær" badge.

- [ ] **Step 4: Manual test — set a different primary contact**

On that customer's edit page, add a second contact, click "Sett som hovedkontakt" on it. Confirm the first contact's "Primær" badge disappears from the detail page and moves to the new one (this exercises the Task 1 DB trigger — it will only actually flip `is_primary` once migration 172 has been run against Supabase; until then, expect the UPDATE to succeed but the previous primary to stay marked too, same temporary gap as other blocked migrations in CLAUDE.md).

- [ ] **Step 5: Manual test — new project with inline new customer**

Go to `/admin/projects/new`, type a brand-new customer name, leave the "Kontaktperson" field blank, submit. Confirm (via `/admin/customers`) that the created customer has exactly one contact whose name equals the customer name (the fallback from Task 10, Step 2).

- [ ] **Step 6: Manual test — contract/quote/faktura pages still render**

Open an existing project's Tilbud, Kontrakt and Fakturert pages. Confirm no runtime errors in the browser console and that customer name displays correctly everywhere the old "navn — firma" suffix used to show (it should now just show the account name once).

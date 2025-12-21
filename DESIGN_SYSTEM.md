# Design System - Oversikt

Dette dokumentet viser hvor alle farger og tekststiler er definert, slik at du enkelt kan endre dem et sted.

## 📍 Hvor endrer du farger?

**Alle farger er definert i:**
- `app/globals.css` - CSS variabler (kilden til sannheten)
- `tailwind.config.ts` - Mapper CSS variabler til Tailwind klasser

## 🎨 Farge-system

### Hovedtekstfarger
- `--color-white` / `text-white` - Hvit variant tekst
- `--color-dark` / `text-dark` - Mørk tekstfarge

**Endre i:** `app/globals.css` linje 9-10

### Bakgrunnsfarger
- `--color-background` / `bg-background` - Hovedbakgrunn
- `--color-background-surface` / `bg-background-surface` - Overflate (cards)
- `--color-background-elevated` / `bg-background-elevated` - Hevet overflate

**Endre i:** `app/globals.css` linje 13-15

### Knapp-farger
- `--color-primary` / `bg-primary` - Primær knapp
- `--color-secondary` / `bg-secondary` - Sekundær knapp
- `--color-danger` / `bg-danger` - Fare-knapp

**Endre i:** `app/globals.css` linje 18-27

### Status-farger
- `--color-success` / `bg-success` - Suksess (grønn)
- `--color-warning` / `bg-warning` - Advarsel (gul)
- `--color-info` / `bg-info` - Info (blå)

**Endre i:** `app/globals.css` linje 30-38

### Admin-side farger (mørk bakgrunn)
- `--color-admin-bg` / `bg-admin-bg` - Admin bakgrunn (svart)
- `--color-admin-surface` / `bg-admin-surface` - Admin overflate (mørk grå)
- `--color-admin-text` / `text-admin-text` - Admin tekst (hvit)
- `--color-admin-text-muted` / `text-admin-text-muted` - Admin tekst (lys grå)

**Endre i:** `app/globals.css` linje 41-47

## 📝 Typografi

### Heading-størrelser
- `heading-xl` - 6.5rem (104px)
- `heading-lg` - 3.5rem (56px)
- `heading-md` - 2.5rem (40px)
- `heading-sm` - 1.75rem (28px)

**Endre i:** `tailwind.config.ts` linje 62-65

### Body-størrelser
- `body-lg` - 1.125rem (18px)
- `body` - 1rem (16px)
- `body-sm` - 0.75rem (12px)
- `body-xs` - 0.50rem (8px)

**Endre i:** `tailwind.config.ts` linje 67-70

## ✅ Komponenter som bruker designsystemet

### ✅ Fullt oppdatert:
- `components/ui/Button.tsx` - Bruker `primary`, `secondary`, `danger` farger
- `components/ui/Card.tsx` - Bruker `background-surface` og `border`
- `components/ui/Badge.tsx` - Bruker `success`, `warning` status-farger
- `components/ui/Input.tsx` - Bruker `admin-*` farger
- `components/ui/Textarea.tsx` - Bruker `admin-*` farger
- `components/ui/Heading.tsx` - Bruker `text-dark` og heading-størrelser
- `components/ui/Text.tsx` - Bruker `text-dark` og body-størrelser

### ⚠️ Delvis oppdatert (bruker noen hardkodede farger):
- `app/admin/projects/[id]/edit/page.tsx` - Bruker `bg-black`, `text-white` for admin-side (OK)
- `app/admin/images/new/page.tsx` - Bruker `bg-black`, `text-white` for admin-side (OK)
- `components/ui/ImagePickerModal.tsx` - Bruker `bg-black/80` for modal overlay (OK)
- `components/ui/DeliverableCard.tsx` - Bruker `bg-zinc-300` (kan oppdateres)

## 🔧 Hvordan endre farger

1. **Åpne** `app/globals.css`
2. **Finn** CSS variabelen du vil endre (f.eks. `--color-dark`)
3. **Endre** hex-koden (f.eks. `#2F2F2F` → `#000000`)
4. **Lagre** - Endringen gjelder automatisk for alle komponenter som bruker den fargen!

## 📋 Eksempel: Endre mørk tekstfarge

```css
/* Før */
--color-dark: #2F2F2F;

/* Etter */
--color-dark: #000000;
```

Alle komponenter som bruker `text-dark` vil automatisk få den nye fargen!


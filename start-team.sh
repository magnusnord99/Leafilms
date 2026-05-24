#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  Leafilms AI Dev Team
#  Starter tmux-sesjon med Kai, Nova og Lena
#  Bruk: ./start-team.sh
# ─────────────────────────────────────────────────────────────────

SESSION="leafilms"
DIR="/Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch"
TEAMCHAT="$DIR/TEAMCHAT.md"

# ─── Opprett delt chat-fil ─────────────────────────────────────────
if [ ! -f "$TEAMCHAT" ]; then
  cat > "$TEAMCHAT" << 'EOF'
# Leafilms Teamchat

Delt kommunikasjon mellom Kai, Nova og Lena.
Bruk Read-verktøyet for å se hva andre har skrevet, og Edit/Write for å svare.
Format: **[Navn - tidspunkt]** Melding

---
EOF
  echo "Opprettet TEAMCHAT.md"
fi

# ─── Persona-prompts (leses inn som filer for å unngå escaping) ────
PERSONA_DIR="$DIR/.claude/personas"
mkdir -p "$PERSONA_DIR"

cat > "$PERSONA_DIR/kai.txt" << 'PERSONA'
Du er KAI, Frontend Developer i Leafilms-teamet. Svar alltid på norsk.

ROLLE: UI-komponenter, design system, React, client-side features, animasjoner.

STACK OG REGLER:
- Next.js 16 App Router — server components by default, "use client" kun når nødvendig
- Tailwind CSS v4 — ingen @apply der det ikke er nødvendig
- TypeScript — strict mode
- Design: cinematic warm dark palette. Cormorant Garamond (headings), DM Sans (body)
- Ingen generisk AI-estetikk. Følg eksisterende mønstre i components/ og app/admin/

KOMMUNIKASJON:
- Les TEAMCHAT.md i prosjektmappa for meldinger fra Nova og Lena
- Skriv dit når du vil informere teamet om noe
- Fortell Magnus direkte når noe er klart

START: Presenter deg kort (1 setning) og si at du er klar.
PERSONA

cat > "$PERSONA_DIR/nova.txt" << 'PERSONA'
Du er NOVA, Backend/Fullstack Developer i Leafilms-teamet. Svar alltid på norsk.

ROLLE: Supabase, API-ruter, database-migrasjoner, server actions, AI-integrasjon.

STACK OG REGLER:
- Supabase PostgreSQL med RLS — alltid sett opp RLS på nye tabeller
- Migrasjoner i supabase/migrations/ med nummerert prefix — sjekk alltid siste nummer (neste er 038_)
- Next.js Server Actions og API routes i app/api/
- Anthropic AI SDK (@anthropic-ai/sdk) og OpenAI SDK er installert
- Eksisterende services ligger i lib/services/ — ikke dupliser logikk

OBS — UAPPLIED MIGRASJONER (blokkert):
- database-migrations/036_project_messages.sql
- database-migrations/037_market_analysis.sql
Disse er skrevet men ikke kjørt mot Supabase ennå.

KOMMUNIKASJON:
- Les TEAMCHAT.md i prosjektmappa for meldinger fra Kai og Lena
- Skriv dit når du vil informere teamet om noe

START: Presenter deg kort (1 setning) og si at du er klar.
PERSONA

cat > "$PERSONA_DIR/lena.txt" << 'PERSONA'
Du er LENA, Tech Lead og Code Reviewer i Leafilms-teamet. Svar alltid på norsk.

ROLLE: Arkitektur, kodegjennomgang, konsistens, cross-cutting concerns.

ANSVAR:
- Reviewer ny kode for konsistens med eksisterende mønstre
- Sjekk at RLS er satt opp riktig på alle nye tabeller
- Sjekk at types i lib/types.ts er oppdatert
- Ingen over-ingeniering eller premature abstraksjoner
- Migrasjoner må ha konsistente nummer (neste: 038_)

FILOSOFI:
- Lean: minste mulige feature som gir verdi
- Kvalitet over hastighet — gjør ting riktig første gang
- Ikke bygg for hypotetisk fremtid

KOMMUNIKASJON:
- Les TEAMCHAT.md i prosjektmappa for meldinger fra Kai og Nova
- Skriv dit når du har review-kommentarer eller arkitektur-innspill

START: Presenter deg kort (1 setning) og si at du er klar til review.
PERSONA

# ─── Tmux-oppsett ──────────────────────────────────────────────────

# Stopp eksisterende sesjon
tmux kill-session -t "$SESSION" 2>/dev/null

# Ny sesjon — magnus-vinduet (arbeidsvindu)
tmux new-session -d -s "$SESSION" -n "magnus" -c "$DIR"

# Agent-vinduer
tmux new-window -t "$SESSION" -n "kai"  -c "$DIR"
tmux new-window -t "$SESSION" -n "nova" -c "$DIR"
tmux new-window -t "$SESSION" -n "lena" -c "$DIR"

# ─── Statusbar-oppsett ─────────────────────────────────────────────
tmux set-option -t "$SESSION" status on
tmux set-option -t "$SESSION" status-position bottom
tmux set-option -t "$SESSION" status-style "bg=#1a1a1a,fg=#888888"
tmux set-option -t "$SESSION" status-left-length 20
tmux set-option -t "$SESSION" status-right-length 60
tmux set-option -t "$SESSION" status-left "#[fg=#d4a855,bold] LEAFILMS #[fg=#444]│ "
tmux set-option -t "$SESSION" status-right "#[fg=#444]│ #[fg=#888]TEAMCHAT: cat TEAMCHAT.md "
tmux set-option -t "$SESSION" window-status-format " #[fg=#555]#I:#W "
tmux set-option -t "$SESSION" window-status-current-format " #[fg=#d4a855,bold]#I:#W "
tmux set-option -t "$SESSION" window-status-separator ""

# ─── Start agenter ────────────────────────────────────────────────
tmux send-keys -t "$SESSION:kai" \
  "claude -n 'Kai · Frontend' --append-system-prompt \"\$(cat $PERSONA_DIR/kai.txt)\"" \
  Enter

tmux send-keys -t "$SESSION:nova" \
  "claude -n 'Nova · Backend' --append-system-prompt \"\$(cat $PERSONA_DIR/nova.txt)\"" \
  Enter

tmux send-keys -t "$SESSION:lena" \
  "claude -n 'Lena · Tech Lead' --append-system-prompt \"\$(cat $PERSONA_DIR/lena.txt)\"" \
  Enter

# ─── Magnus-vinduet: split for dev-server og shell ────────────────
tmux split-window -v -t "$SESSION:magnus" -c "$DIR" -l 8
tmux send-keys -t "$SESSION:magnus.1" "echo '  Leafilms Dev Team klar.'" Enter
tmux send-keys -t "$SESSION:magnus.1" "echo '  Vinduer: [kai] [nova] [lena]'" Enter
tmux send-keys -t "$SESSION:magnus.1" "echo '  Start dev-server: npm run dev'" Enter
tmux send-keys -t "$SESSION:magnus.1" "echo ''" Enter

# Gå til magnus-vinduet og øverste pane
tmux select-window -t "$SESSION:magnus"
tmux select-pane -t "$SESSION:magnus.1"

# ─── Koble til ────────────────────────────────────────────────────
echo ""
echo "  Leafilms Dev Team starter..."
echo "  Sesjon: $SESSION"
echo "  Bytt vindu: Ctrl+B + [1-4] eller Ctrl+B + n/p"
echo ""
tmux attach-session -t "$SESSION"

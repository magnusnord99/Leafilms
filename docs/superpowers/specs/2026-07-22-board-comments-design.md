# Board-kommentarer med @mentions — Design spec

**Dato:** 2026-07-22
**Status:** Godkjent av Magnus

## Bakgrunn

Boards (`app/admin/boards`, se [[2026-07-13-boards-milanote-design]]) mangler en måte for teamet å peke på et konkret kort og be om en endring — i dag må feedback gis muntlig eller i prosjekt-chatten, løsrevet fra hvor på boardet den faktisk gjelder. Eksempel: Eivind vil kommentere på et bestemt bilde i et moodboard og be om at det fikses.

Teamet har allerede en fungerende mention/varsel-infrastruktur fra [[2026-07-01-chat-realtime-mentions-design]] (`lib/mentions.ts`, `MentionTextInput`, `notifications`-tabellen med type-spesifikke triggere). Den gjenbrukes her. Tråd-svar (flere innlegg på samme sak) finnes ikke fra før noe sted i systemet og er nytt i denne funksjonen.

## Mål

- Enhver kan feste en kommentar til et konkret kort på boardet (bilde, notat, farge, etc.).
- Andre teammedlemmer kan svare i samme tråd.
- @nevner man noen i en kommentar eller et svar, får den personen et eget varsel.
- Den som startet en tråd får varsel når noen svarer, selv uten @tag.
- En tråd kan markeres som løst/uløst.

## Scope

- **Kun internt team** — kommentarer er ikke synlige eller redigerbare fra den offentlige delingslenken (`/b/[token]`). Den lenken forblir uendret.
- Kommentarer festes til et **kort** (`board_cards.id`), ikke et fritt punkt på canvaset.
- Sanntid: kommentarer/svar/løst-status oppdateres live for alle som har boardet åpent, samme mønster som resten av boards-realtime.

## Datamodell

### Migrasjon `118_board_comments.sql`

```sql
CREATE TABLE IF NOT EXISTS board_comment_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Én tråd per kort — legges lazy ved første kommentar
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_comment_threads_card ON board_comment_threads(card_id);
CREATE INDEX IF NOT EXISTS idx_board_comment_threads_board ON board_comment_threads(board_id);

CREATE TABLE IF NOT EXISTS board_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES board_comment_threads(id) ON DELETE CASCADE,
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  mentions   UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_comments_thread ON board_comments(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_comments_board ON board_comments(board_id);

-- RLS: samme "authenticated full access"-mønster som boards/board_cards/board_edges (098_boards.sql)
ALTER TABLE board_comment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_comments        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_comment_threads' AND policyname = 'authenticated full access board_comment_threads') THEN
    EXECUTE 'CREATE POLICY "authenticated full access board_comment_threads" ON board_comment_threads FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_comments' AND policyname = 'authenticated full access board_comments') THEN
    EXECUTE 'CREATE POLICY "authenticated full access board_comments" ON board_comments FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Realtime (mønster: 098_boards.sql)
ALTER TABLE board_comment_threads REPLICA IDENTITY FULL;
ALTER TABLE board_comments        REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comment_threads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_comment_threads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_comments;
  END IF;
END$$;

-- Varsler: nye kolonner + typer
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS board_card_id UUID REFERENCES board_cards(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message',
    'board_comment_mention', 'board_comment_reply'
  ));
```

### Trigger — `notify_board_comment()`

Speiler `notify_task_message()` (056_notifications.sql):

```sql
CREATE OR REPLACE FUNCTION notify_board_comment()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  preview   TEXT;
  thr       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.content, 80);
  SELECT t.id, t.created_by, t.card_id, b.project_id
    INTO thr
    FROM board_comment_threads t
    JOIN boards b ON b.id = t.board_id
    WHERE t.id = NEW.thread_id;
  proj_id := thr.project_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.author_id;

  -- Mentions
  FOR rec IN
    SELECT DISTINCT m AS profile_id FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.author_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, board_id, board_card_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'board_comment_mention', proj_id, NEW.board_id, thr.card_id, preview, sndr_name);
  END LOOP;

  -- Tråd-starter, hvis ikke allerede varslet via mention
  IF thr.created_by IS NOT NULL AND thr.created_by != NEW.author_id
     AND thr.created_by != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, board_id, board_card_id, message_preview, sender_name)
    VALUES (thr.created_by, 'board_comment_reply', proj_id, NEW.board_id, thr.card_id, preview, sndr_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_board_comment ON board_comments;
CREATE TRIGGER trg_notify_board_comment
AFTER INSERT ON board_comments
FOR EACH ROW EXECUTE FUNCTION notify_board_comment();
```

## Backend — server actions

**Ny fil** `lib/actions/boardComments.ts` (egen fil, ikke lagt til i `boards.ts` som allerede er stor):

- `getBoardComments(boardId): Promise<Record<cardId, { thread: BoardCommentThread; comments: BoardComment[] }>>` — henter alle tråder + kommentarer for boardet i to samlede spørringer (én for tråder, én for kommentarer `where thread_id in (...)`). Kalles fra `getBoardData` i `boards.ts` og legges til på `BoardData`-typen som `comments`.
- `postBoardComment(cardId: string, boardId: string, content: string, mentions: string[])` — oppretter tråd hvis den ikke finnes for kortet (upsert på `card_id`), deretter insert i `board_comments`. Trigger håndterer varsling.
- `resolveThread(threadId: string, resolved: boolean)` — setter `resolved`, `resolved_by`, `resolved_at`.
- `deleteBoardComment(id: string)` — kun egen kommentar (RLS er staff-full-access, så tilhørighet sjekkes i actionen: `author_id === auth.uid()`).

Typer legges til `lib/types.ts`: `BoardCommentThread`, `BoardComment`.

## Frontend

### 1. Kommentar-badge på kortet

`components/boards/nodes/CardShell.tsx` får en ny påkrevd prop `cardId: string`. Alle ni node-komponenter (`NoteNode`, `ImageNode`, `VideoNode`, `LinkNode`, `ColorNode`, `TodoNode`, `ColumnNode`, `ScheduleNode`, `StorylineNode`, `BoardNode`) oppdateres til å sende `id` (allerede tilgjengelig via `NodeProps`) inn som `cardId` — mekanisk endring, ingen logikkendring i selve nodene.

CardShell rendrer et 💬-ikon i øvre høyre hjørne:
- 0 kommentarer: skjult, vises kun ved hover over kortet.
- ≥1 kommentar: alltid synlig, med antall (`💬 2`).
- Løst tråd: ikonet dempes (grå i stedet for aksentfarge), fortsatt klikkbart.

### 2. Kommentar-context

**Ny fil** `components/boards/boardCommentsContext.tsx` — egen context (holdes adskilt fra `boardContext.tsx` for å ikke blande UI-tema med data). Eksponerer:
- `threadsByCard: Record<string, { thread: BoardCommentThread; comments: BoardComment[] }>`
- `openThread(cardId: string)` / `closeThread()`
- `postComment`, `resolveThread` — wrapper rundt server actions med optimistisk oppdatering, samme `markLocalOp`-mønster som `boardContext` bruker for kort, for å unngå at egen realtime-echo dobbeltlegger meldingen.

`BoardCanvas.tsx` setter opp én realtime-subscription på `board_comments` + `board_comment_threads` filtrert på `board_id` (samme mønster som eksisterende subscription på `board_cards`/`board_edges`), og fyller denne contexten.

### 3. Tråd-popover

**Ny fil** `components/boards/CommentThread.tsx` — åpnes ved klikk på 💬-ikonet, posisjonert ved kortet (absolutt posisjonert relativt til noden, ikke en egen xyflow-node):
- Liste over meldinger: avsendernavn, tidspunkt, tekst med mention-utheving (gjenbruker `splitMentionSegments` fra `lib/mentions.ts`).
- `MentionTextInput` (gjenbrukt uendret) for nytt svar — profiles-listen er hele teamet, samme som chat.
- "Merk som løst" / "Gjenåpne"-knapp øverst i tråden.
- Lukkes ved klikk utenfor popoveren eller Escape.

Ingen endring i `Toolbar.tsx` — kommentarer er ikke en plasserbar korttype.

### 4. Varsel-UI og navigasjon

**Filer:** `lib/actions/notifications.ts` (typen `Notification`), `components/admin/NotificationBell.tsx` (ingen endring — den er type-agnostisk), `app/admin/varsler/VarslerClient.tsx`:

- `board_comment_mention` → "**{navn}** nevnte deg i en boardkommentar".
- `board_comment_reply` → "**{navn}** svarte på kommentaren din på boardet".
- Klikk navigerer til `/admin/boards/${board_id}?comment=${board_card_id}`.
- `BoardPageClient.tsx` leser `comment`-query-param ved mount: kaller `rf.fitView({ nodes: [{ id: cardId }] })` for å panorere/zoome til kortet, og åpner `CommentThread`-popoveren for det kortet automatisk.

`replyToNotification` (samme fil) utvides ikke i denne omgang — svar på board-kommentar-varsler direkte fra varselsiden er utenfor scope (se under).

## Ikke inkludert

- Kommentarer på et fritt punkt på canvaset (kun kort-festet).
- Ekstern/kunde-tilgang til kommentarer via `/b/[token]`.
- Svare på boardkommentar-varsler direkte fra `/admin/varsler` (må åpne boardet).
- E-postvarsler eller push — alt forblir in-app, som resten av systemet.
- Reaksjoner (👍 etc.) på boardkommentarer.
- Flere tråder per kort — én tråd, kan gjenåpnes etter løst.

## Testing

- Manuell test: kommentér på et kort, verifiser at 💬-ikonet dukker opp med riktig antall for alle som har boardet åpent (to faner/brukere).
- Manuell test: @nevn en person i en kommentar — verifiser at de får `board_comment_mention`-varsel og at klikk navigerer til riktig board + kort med tråden åpnet.
- Manuell test: svar på en tråd uten å tagge noen — verifiser at tråd-starteren får `board_comment_reply`, og at avsender selv ikke får varsel om egen melding.
- Manuell test: tråd-starter er også tagget i svaret — verifiser kun ett varsel (mention), ikke to.
- Manuell test: marker tråd som løst — ikonet dempes for alle som har boardet åpent (realtime); gjenåpne fjerner dempingen.
- Manuell test: slett egen kommentar — forsvinner for alle; forsøk på å slette andres kommentar avvises.

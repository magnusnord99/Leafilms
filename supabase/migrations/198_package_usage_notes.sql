-- 198_package_usage_notes.sql
--
-- Redigerbar tekst for "Slik bruker du leveransen"-panelet i PackageDetailModal
-- ("Se mer"-modalen) — én rad pr. QuotePackageShowcaseKind, delt globalt på
-- tvers av alle flyers/pakker (samme singleton-aktige mønster som
-- company_direction/email_footer_template) siden teksten er generisk
-- forklaring av hva hver medietype brukes til, ikke pakke-spesifikk.
-- Radene var tidligere hardkodet i PackageDetailModal.tsx (feedback 2026-11-10:
-- "man må kunne endre på teksten her").
--
-- Faste 4 rader, kun UPDATE — ingen INSERT/DELETE-policy, siden settet med
-- kind-er er fast (samme fire som quote_package_showcase_items.kind).

CREATE TABLE package_usage_notes (
  kind       text PRIMARY KEY CHECK (kind IN ('main_video', 'social_clip', 'photo', 'website_photo')),
  label      text NOT NULL,
  note       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE package_usage_notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON package_usage_notes TO anon, authenticated;
GRANT UPDATE (label, note, updated_at, updated_by) ON package_usage_notes TO authenticated;

CREATE POLICY "public_read_package_usage_notes" ON package_usage_notes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "staff_update_package_usage_notes" ON package_usage_notes
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO package_usage_notes (kind, label, note) VALUES
  ('main_video', 'Hovedvideo', 'Klar til bruk på landingssiden eller forsiden av nettstedet ditt.'),
  ('social_clip', 'Klipp', 'Tilpasset sosiale medier — Instagram, TikTok og Stories.'),
  ('photo', 'Bilder', 'Fri bruk i nyhetsbrev, trykksaker og egne kanaler.'),
  ('website_photo', 'Nettside-bilder', 'Ferdig tilpasset til bruk direkte på nettsiden.')
ON CONFLICT (kind) DO NOTHING;

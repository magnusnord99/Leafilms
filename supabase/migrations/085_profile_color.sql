-- Avatarfarge: brukeren velger selv én av 15 faste farger på sin profilside.
-- NULL betyr "ikke valgt ennå" — appen faller da tilbake til en hash-basert
-- farge (se lib/avatar-colors.ts). Unik partial index sikrer at to brukere
-- aldri kan eie samme farge samtidig, selv ved samtidige valg.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_color_check CHECK (
    color IS NULL OR color IN (
      '#7C5CFC', '#9B6BD9', '#6B7EC4', '#4A8FA8', '#4A9AC4',
      '#50C8C8', '#4CAF7D', '#5C9E6B', '#8FA84A', '#C49434',
      '#E0A840', '#E07B54', '#C4634A', '#B85C8A', '#E8529A'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_color_unique
  ON profiles(color)
  WHERE color IS NOT NULL;

COMMENT ON COLUMN profiles.color IS 'Valgfri, unik avatarfarge valgt av brukeren selv på /admin/profile. NULL = hash-basert fallback.';

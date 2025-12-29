-- Tabell for collage preset-sett (de 4 forhåndsdefinerte settene)
CREATE TABLE IF NOT EXISTS collage_presets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,           -- F.eks. "Industri", "Livsstil", "Natur", "Event"
    description TEXT,                      -- Beskrivelse av settet for AI-matching
    keywords TEXT[],                       -- Nøkkelord for AI-matching (f.eks. ['industri', 'fabrikk', 'arbeid'])
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabell for bilder i hvert preset (5 bilder per sett)
CREATE TABLE IF NOT EXISTS collage_preset_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preset_id INTEGER NOT NULL REFERENCES collage_presets(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    position VARCHAR(20) NOT NULL CHECK (position IN ('pos1', 'pos2', 'pos3', 'pos4', 'pos5')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(preset_id, position)  -- Bare ett bilde per posisjon per preset
);

-- Tabell for prosjekt-spesifikke collage-bilder (når bruker bytter ut bilder)
CREATE TABLE IF NOT EXISTS project_collage_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    position VARCHAR(20) NOT NULL CHECK (position IN ('pos1', 'pos2', 'pos3', 'pos4', 'pos5')),
    -- Hvilket preset som ble brukt som utgangspunkt
    original_preset_id INTEGER REFERENCES collage_presets(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, section_id, position)  -- Bare ett bilde per posisjon per seksjon
);

-- Legg til selected_preset_id i sections content, eller vi kan tracke det separat
-- Vi bruker content-feltet i sections for å lagre preset_id

-- Sett inn de 4 standard presets (du fyller inn riktige bilder senere)
INSERT INTO collage_presets (id, name, description, keywords) VALUES
(1, 'Industri & Arbeidsliv', 'Bilder fra industri, fabrikker og arbeidsplasser', ARRAY['industri', 'fabrikk', 'arbeid', 'produksjon', 'teknologi']),
(2, 'Livsstil & Mote', 'Livsstilsbilder, mote og fashion', ARRAY['livsstil', 'mote', 'fashion', 'klær', 'modell']),
(3, 'Natur & Friluftsliv', 'Naturbilder, friluftsliv og utendørs aktiviteter', ARRAY['natur', 'friluftsliv', 'fjell', 'skog', 'utendørs']),
(4, 'Event & Mennesker', 'Event-bilder, konferanser og mennesker', ARRAY['event', 'konferanse', 'mennesker', 'møte', 'feiring'])
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_collage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collage_presets_updated_at
    BEFORE UPDATE ON collage_presets
    FOR EACH ROW
    EXECUTE FUNCTION update_collage_updated_at();

CREATE TRIGGER project_collage_images_updated_at
    BEFORE UPDATE ON project_collage_images
    FOR EACH ROW
    EXECUTE FUNCTION update_collage_updated_at();


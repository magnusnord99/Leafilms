-- Add updated_at column to section_images table
-- This is needed for tracking when background position is updated

ALTER TABLE section_images
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add comment for clarity
COMMENT ON COLUMN section_images.updated_at IS 'Timestamp when the record was last updated';


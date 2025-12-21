-- Add background image position and zoom fields to section_images
-- These fields are optional and only used when images are used as backgrounds

ALTER TABLE section_images
ADD COLUMN IF NOT EXISTS background_position_x NUMERIC DEFAULT 50,  -- Percentage (0-100), default center
ADD COLUMN IF NOT EXISTS background_position_y NUMERIC DEFAULT 50,  -- Percentage (0-100), default center
ADD COLUMN IF NOT EXISTS background_zoom NUMERIC DEFAULT 1.0;     -- Zoom level (1.0 = 100%, 1.5 = 150%, etc.)

-- Add comments for clarity
COMMENT ON COLUMN section_images.background_position_x IS 'Horizontal position of background image in percentage (0-100). 50 = center.';
COMMENT ON COLUMN section_images.background_position_y IS 'Vertical position of background image in percentage (0-100). 50 = center.';
COMMENT ON COLUMN section_images.background_zoom IS 'Zoom level for background image. 1.0 = 100%, 1.5 = 150%, etc.';


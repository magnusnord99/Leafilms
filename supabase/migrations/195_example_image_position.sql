-- 195_example_image_position.sql
--
-- Lar hvert av de 8 eksempelbildene flyttes i x/y-retning innenfor sin egen
-- faste ramme (object-position-aktig justering av crop-fokuspunkt) — samme
-- idé som background_position_x/y på section_images (migrasjon 009), men
-- som egne kolonner pr. bilde her siden eksempelbildene allerede er faste
-- kolonner (ikke rader i en tabell).

ALTER TABLE sales_flyers ADD COLUMN example_image_1_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_1_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_2_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_2_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_3_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_3_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_4_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_4_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_5_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_5_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_6_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_6_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_7_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_7_position_y numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_8_position_x numeric NOT NULL DEFAULT 50;
ALTER TABLE sales_flyers ADD COLUMN example_image_8_position_y numeric NOT NULL DEFAULT 50;

-- 192_sales_flyer_bts_images.sql
--
-- To bilder side ved side helt nederst på flyeren ("BTS"-bilder, fra
-- opptak) — egne felt, ikke en ny ordnet case-type, siden det alltid er
-- eksakt to bilder i et fast layout (ikke en liste). Samme kopier-ikke-
-- referer-mønster som hero_poster_path/cases: velges fra bildebiblioteket,
-- men kopieres inn i flyerens egen sales-flyers/{slug}/-mappe
-- (copyLibraryImageToFlyer), så en senere sletting i biblioteket ikke kan
-- brekke en publisert flyer.

ALTER TABLE sales_flyers ADD COLUMN bts_image_1_path text;
ALTER TABLE sales_flyers ADD COLUMN bts_image_2_path text;

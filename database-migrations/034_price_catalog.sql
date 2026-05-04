-- Price catalog for standard items used in quotes (equipment, lighting, sound, etc.)
CREATE TABLE IF NOT EXISTS price_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'kamera', 'lys', 'lyd', 'transport', 'utstyr', 'post', 'annet'
  default_price INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'stk', -- 'stk', 'per dag', 'per time', 'per uke'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with common items
INSERT INTO price_catalog (name, category, default_price, unit) VALUES
  ('Sony FX3', 'kamera', 3500, 'per dag'),
  ('Sony FX6', 'kamera', 5000, 'per dag'),
  ('DJI Ronin 4D', 'kamera', 4500, 'per dag'),
  ('Drone DJI Mavic 3 Pro', 'kamera', 2500, 'per dag'),
  ('Objektiv 24-70mm', 'kamera', 800, 'per dag'),
  ('Aputure 300D Mark II', 'lys', 1200, 'per dag'),
  ('Aputure 120D', 'lys', 800, 'per dag'),
  ('RGB LED Panel', 'lys', 600, 'per dag'),
  ('Softbox stor', 'lys', 400, 'per dag'),
  ('Reflekser/flagg sett', 'lys', 300, 'per dag'),
  ('Røde NTG5 mikrofon', 'lyd', 500, 'per dag'),
  ('Zoom F6 opptaker', 'lyd', 800, 'per dag'),
  ('DJI Mic 2', 'lyd', 400, 'per dag'),
  ('Montering og rigg', 'utstyr', 1500, 'per dag'),
  ('Stativ sett', 'utstyr', 600, 'per dag'),
  ('Batterier og strøm', 'utstyr', 500, 'per dag'),
  ('Minnekort (256GB)', 'utstyr', 200, 'per dag'),
  ('Biltransport', 'transport', 1500, 'per dag'),
  ('Flyreise', 'transport', 2500, 'stk'),
  ('Overnatting', 'transport', 1200, 'per natt'),
  ('Adobe Premiere Pro', 'post', 0, 'stk'),
  ('DaVinci Resolve Studio', 'post', 0, 'stk'),
  ('Musikklisens', 'post', 3000, 'stk');

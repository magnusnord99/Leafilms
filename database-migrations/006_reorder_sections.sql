-- Endre rekkefølge: Konsept før Mål
-- Oppdaterer order_index for eksisterende prosjekter

-- Konsept skal være 2 (i stedet for 3)
UPDATE sections
SET order_index = 2
WHERE type = 'concept';

-- Mål skal være 3 (i stedet for 2)
UPDATE sections
SET order_index = 3
WHERE type = 'goal';

-- Resten forblir uendret:
-- Hero: 1
-- Cases: 4
-- Moodboard: 5
-- Timeline: 6
-- Deliverables: 7
-- Contact: 8


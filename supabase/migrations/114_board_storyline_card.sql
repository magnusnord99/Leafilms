-- 114_board_storyline_card.sql
-- Ny board-korttype "storyline" (synopsis + rekke paneler med bilde/tekst).
-- Innhold lagres inline i board_cards.content, samme mønster som alle andre korttyper.
-- Bilder lastes opp til eksisterende 'board-images'-bucket (samme som image-kortet).

ALTER TABLE board_cards DROP CONSTRAINT IF EXISTS board_cards_type_check;
ALTER TABLE board_cards ADD CONSTRAINT board_cards_type_check
  CHECK (type IN ('note','image','video','link','color','todo','column','board','schedule','storyline'));

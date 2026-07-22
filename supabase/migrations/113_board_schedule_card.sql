-- 113_board_schedule_card.sql
-- Ny board-korttype "schedule" (Timeplan for opptaksdagen).
-- Innhold lagres inline i board_cards.content, samme mønster som alle andre korttyper.

ALTER TABLE board_cards DROP CONSTRAINT IF EXISTS board_cards_type_check;
ALTER TABLE board_cards ADD CONSTRAINT board_cards_type_check
  CHECK (type IN ('note','image','video','link','color','todo','column','board','schedule'));

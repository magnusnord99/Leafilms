-- 134_unavailability_end_date.sql
-- Lar en utilgjengelig-markering strekke seg over flere hele dager (f.eks. ferie
-- mandag–fredag), i tillegg til én dag med valgfritt klokkeslett (133_unavailability.sql).
-- Klokkeslett og fler-dagers-rekkevidde kombineres ikke — UI håndhever dette:
-- er end_date > date, er det en hel-dags-rekkevidde og start_time/end_time er null.

ALTER TABLE unavailability ADD COLUMN IF NOT EXISTS end_date DATE;

-- Make sheet_url nullable since quotes can now be created directly in the app
ALTER TABLE quotes ALTER COLUMN sheet_url DROP NOT NULL;
ALTER TABLE quotes ALTER COLUMN sheet_url SET DEFAULT '';

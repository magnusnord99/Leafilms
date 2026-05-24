-- Add optional daily rate (NOK) to team members for use in quote builder
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS daily_rate INTEGER;

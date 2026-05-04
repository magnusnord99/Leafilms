-- Add auto-incrementing customer number starting at 101
CREATE SEQUENCE IF NOT EXISTS customer_number_seq START 101;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_number INTEGER UNIQUE DEFAULT nextval('customer_number_seq');
UPDATE customers SET customer_number = nextval('customer_number_seq') WHERE customer_number IS NULL;
ALTER TABLE customers ALTER COLUMN customer_number SET NOT NULL;

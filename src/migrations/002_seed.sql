-- 002_seed.sql
-- Seed the mock SMS providers with different priorities and failure rates.
INSERT INTO
  providers (name, priority, balance, failure_rate, is_active)
VALUES
  ('ROUTE_A', 1, 500, 0.30, true),
  ('ROUTE_B', 2, 300, 0.20, true),
  ('ROUTE_C', 3, 100, 0.50, true)
  -- Update existing providers if the seed data is run again.
  ON CONFLICT (name) DO
UPDATE
SET
  priority = EXCLUDED.priority,
  balance = EXCLUDED.balance,
  failure_rate = EXCLUDED.failure_rate,
  is_active = EXCLUDED.is_active;
-- Mini SMS Gateway - Core Schema
-- Tracking table used by scripts/migrate.js to prevent running migrations twice.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application users.
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User credit balances. One wallet per user.
-- The CHECK constraint acts as a final safeguard against overspending.
CREATE TABLE IF NOT EXISTS wallets (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance    INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallets_balance_nonnegative CHECK (balance >= 0)
);

-- Mock SMS providers. Lower priority number means it's tried first.
-- The failure_rate is configurable and is used to simulate network errors.
CREATE TABLE IF NOT EXISTS providers (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  priority     INTEGER NOT NULL UNIQUE,
  balance      INTEGER NOT NULL DEFAULT 0,
  failure_rate NUMERIC(4,3) NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT providers_failure_rate_range CHECK (failure_rate >= 0 AND failure_rate <= 1),
  CONSTRAINT providers_balance_nonnegative CHECK (balance >= 0)
);

-- Speeds up the failover query which orders by priority and checks active status.
CREATE INDEX IF NOT EXISTS idx_providers_active_priority ON providers (is_active, priority);

-- Stores the top-level SMS request batch.
-- A single message can be split into multiple parts (segments) and sent to multiple recipients.
CREATE TABLE IF NOT EXISTS messages (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_body      TEXT NOT NULL,
  encoding          TEXT NOT NULL CHECK (encoding IN ('GSM7', 'UCS2')),
  parts_per_message INTEGER NOT NULL CHECK (parts_per_message >= 1),
  recipient_count   INTEGER NOT NULL CHECK (recipient_count >= 1),
  total_cost        INTEGER NOT NULL CHECK (total_cost >= 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Used by the /sms/logs endpoint for filtering and pagination.
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status_created ON messages (status, created_at DESC);

-- Individual tracking for each phone number in a batch.
-- This allows a single batch to partially fail (e.g., ROUTE_A works for one number, ROUTE_B for another).
CREATE TABLE IF NOT EXISTS message_recipients (
  id            BIGSERIAL PRIMARY KEY,
  message_id    BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  phone_number  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  provider_used TEXT,
  cost          INTEGER NOT NULL CHECK (cost >= 0),
  refunded      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipients_message ON message_recipients (message_id);
CREATE INDEX IF NOT EXISTS idx_recipients_phone ON message_recipients (phone_number);
CREATE INDEX IF NOT EXISTS idx_recipients_status ON message_recipients (status);

-- Audit log for the failover process. 
-- Records every provider attempt (success or fail) so the /routes/health endpoint 
-- can calculate 24-hour success rates accurately.
CREATE TABLE IF NOT EXISTS route_attempts (
  id           BIGSERIAL PRIMARY KEY,
  message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES message_recipients(id) ON DELETE CASCADE,
  provider_id  BIGINT NOT NULL REFERENCES providers(id),
  success      BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_provider_time ON route_attempts (provider_id, attempted_at DESC);

-- Append-only ledger for all wallet movements.
-- Tracks deductions (sends), refunds (failed deliveries), and grants (initial signup credits).
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id         BIGSERIAL PRIMARY KEY,
  wallet_id  BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('deduct', 'refund', 'grant')),
  amount     INTEGER NOT NULL CHECK (amount > 0),
  message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_time ON wallet_transactions (wallet_id, created_at DESC);

-- Auto-update the `updated_at` timestamp whenever a row is modified.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallets_updated ON wallets;
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_messages_updated ON messages;
CREATE TRIGGER trg_messages_updated BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_recipients_updated ON message_recipients;
CREATE TRIGGER trg_recipients_updated BEFORE UPDATE ON message_recipients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
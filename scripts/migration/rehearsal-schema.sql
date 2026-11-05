-- ISOLATED REHEARSAL ONLY: not an application migration or production schema.
-- Executed solely by the in-memory test runner; never imported by app runtime.
CREATE SCHEMA rehearsal;
CREATE TABLE rehearsal.source_slice (
  name text PRIMARY KEY,
  payload jsonb NOT NULL,
  value_hash text NOT NULL
);
CREATE TABLE rehearsal.notification (
  id text PRIMARY KEY,
  staff_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','copy')),
  kind text NOT NULL CHECK (kind IN ('assignment','weekly','daily','training','custom')),
  sent_at timestamptz NOT NULL,
  source_order integer NOT NULL UNIQUE CHECK (source_order >= 0),
  read_at timestamptz,
  flagged boolean,
  deleted_at timestamptz,
  archived boolean NOT NULL,
  source_payload jsonb NOT NULL CHECK (jsonb_typeof(source_payload) = 'object'),
  source_hash text NOT NULL,
  CHECK (source_payload->>'id' = id),
  CHECK (source_payload->>'staffId' = staff_id),
  CHECK (source_payload->>'channel' = channel),
  CHECK (source_payload->>'kind' = kind)
);
CREATE INDEX notification_recipient_page ON rehearsal.notification (staff_id, archived, sent_at DESC, source_order);
CREATE TABLE rehearsal.import_record (
  migration_key text PRIMARY KEY,
  source_id text,
  format text NOT NULL CHECK (format IN ('legacy','structured')),
  source_payload jsonb NOT NULL CHECK (jsonb_typeof(source_payload) = 'object'),
  source_hash text NOT NULL,
  CHECK ((format = 'legacy' AND source_id IS NULL) OR (format = 'structured' AND source_id IS NOT NULL))
);
CREATE UNIQUE INDEX structured_import_identity ON rehearsal.import_record(source_id) WHERE source_id IS NOT NULL;

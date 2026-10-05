-- Immutable application audit trail (ISO/IEC 27001:2022 A.5.28, A.8.15, A.8.32).
--
-- Integrity controls:
--   * Append-only: UPDATE / DELETE / TRUNCATE are rejected by triggers, so no
--     application code path (including a compromised route) can rewrite history.
--   * Tamper evidence: each row stores sha256(prev_hash || canonical payload).
--     Editing or removing any row breaks the chain, which /api/audit/verify detects.
--   * Hash computation is serialised with pg_advisory_xact_lock so the chain is
--     strictly linear even under concurrent writers.

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.event (
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_id        uuid PRIMARY KEY,
  occurred_at     timestamptz NOT NULL,
  actor_user_id   text,
  actor_email     text,
  actor_role      text,
  action          text NOT NULL,
  entity_type     text,
  entity_id       text,
  entity_label    text,
  previous_value  jsonb,
  new_value       jsonb,
  reason          text,
  correlation_id  text NOT NULL,
  result          text NOT NULL CHECK (result IN ('success', 'failure')),
  failure_reason  text,
  source          text NOT NULL,
  ip_address      text,
  user_agent      text,
  prev_hash       text,
  hash            text NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_event_occurred_idx   ON audit.event (occurred_at DESC, seq DESC);
CREATE INDEX IF NOT EXISTS audit_event_actor_idx      ON audit.event (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_action_idx     ON audit.event (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_entity_idx     ON audit.event (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_correlation_idx ON audit.event (correlation_id);

CREATE OR REPLACE FUNCTION audit.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.event is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_event_no_update ON audit.event;
-- Statement-level so a mutation is rejected even when it matches zero rows
-- (row-level triggers never fire on an empty match, which would hide probing).
CREATE TRIGGER audit_event_no_update BEFORE UPDATE OR DELETE ON audit.event
  FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation();

DROP TRIGGER IF EXISTS audit_event_no_truncate ON audit.event;
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON audit.event
  FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON audit.event FROM PUBLIC;

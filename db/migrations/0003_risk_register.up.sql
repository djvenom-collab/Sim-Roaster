-- Risk register (ISO 31000-aligned). Separate schema from scheduling data.
-- Risks are never deleted (they are closed); reviews are append-only.
CREATE SCHEMA IF NOT EXISTS risk;

CREATE SEQUENCE IF NOT EXISTS risk.risk_number START 1;

CREATE TABLE IF NOT EXISTS risk.risk (
  id                    text PRIMARY KEY CHECK (id ~ '^R-[0-9]{3,6}$'),
  category              text NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  title                 text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description           text NOT NULL DEFAULT '',
  cause                 text NOT NULL DEFAULT '',
  consequence           text NOT NULL DEFAULT '',
  assets                text[] NOT NULL DEFAULT '{}',
  basis                 text NOT NULL CHECK (basis IN ('observed', 'potential')),
  evidence              jsonb NOT NULL DEFAULT '[]'::jsonb,
  likelihood            smallint NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact                smallint NOT NULL CHECK (impact BETWEEN 1 AND 5),
  inherent_score        smallint GENERATED ALWAYS AS (likelihood * impact) STORED,
  controls              jsonb NOT NULL DEFAULT '[]'::jsonb,
  control_effectiveness text NOT NULL DEFAULT 'none'
                          CHECK (control_effectiveness IN ('none', 'weak', 'partial', 'effective')),
  residual_likelihood   smallint NOT NULL CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact       smallint NOT NULL CHECK (residual_impact BETWEEN 1 AND 5),
  residual_score        smallint GENERATED ALWAYS AS (residual_likelihood * residual_impact) STORED,
  risk_owner            text,
  treatment_strategy    text NOT NULL DEFAULT 'reduce'
                          CHECK (treatment_strategy IN ('avoid', 'reduce', 'transfer', 'accept')),
  treatment_plan        text NOT NULL DEFAULT '',
  treatments            jsonb NOT NULL DEFAULT '[]'::jsonb,
  treatment_owner       text,
  target_date           date,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'treating', 'mitigated', 'accepted', 'closed')),
  acceptance            jsonb,
  review_date           date,
  closed_at             timestamptz,
  closure_reason        text,
  version               integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            text,
  CONSTRAINT accepted_requires_approval CHECK (status <> 'accepted' OR acceptance IS NOT NULL),
  CONSTRAINT closed_requires_reason CHECK (status <> 'closed' OR (closed_at IS NOT NULL AND closure_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS risk_status_idx ON risk.risk (status);
CREATE INDEX IF NOT EXISTS risk_residual_idx ON risk.risk (residual_score DESC);

CREATE TABLE IF NOT EXISTS risk.review (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id             text NOT NULL REFERENCES risk.risk (id) ON DELETE RESTRICT,
  reviewed_at         timestamptz NOT NULL DEFAULT now(),
  reviewer_user_id    text,
  reviewer_email      text,
  outcome             text NOT NULL CHECK (outcome IN ('no_change', 'rescored', 'escalated', 'treatment_updated')),
  notes               text NOT NULL CHECK (length(notes) BETWEEN 1 AND 4000),
  residual_likelihood smallint NOT NULL CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact     smallint NOT NULL CHECK (residual_impact BETWEEN 1 AND 5),
  next_review_date    date
);

CREATE INDEX IF NOT EXISTS review_risk_idx ON risk.review (risk_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION risk.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'risk.% is append-only (% rejected)', TG_TABLE_NAME, TG_OP;
END;
$$;

-- Statement-level so even zero-row UPDATE/DELETE statements are rejected.
DROP TRIGGER IF EXISTS review_no_update ON risk.review;
CREATE TRIGGER review_no_update BEFORE UPDATE OR DELETE ON risk.review
  FOR EACH STATEMENT EXECUTE FUNCTION risk.reject_mutation();
DROP TRIGGER IF EXISTS review_no_truncate ON risk.review;
CREATE TRIGGER review_no_truncate BEFORE TRUNCATE ON risk.review
  FOR EACH STATEMENT EXECUTE FUNCTION risk.reject_mutation();

DROP TRIGGER IF EXISTS risk_no_delete ON risk.risk;
CREATE TRIGGER risk_no_delete BEFORE DELETE ON risk.risk
  FOR EACH STATEMENT EXECUTE FUNCTION risk.reject_mutation();
DROP TRIGGER IF EXISTS risk_no_truncate ON risk.risk;
CREATE TRIGGER risk_no_truncate BEFORE TRUNCATE ON risk.risk
  FOR EACH STATEMENT EXECUTE FUNCTION risk.reject_mutation();

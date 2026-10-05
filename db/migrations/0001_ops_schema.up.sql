-- ============================================================================
-- 0001 — Sim-Roster operational schema (ADDITIVE ONLY)
-- ============================================================================
-- Creates every operational table inside a dedicated `ops` schema so nothing
-- here can collide with, alter, or drop the Better Auth tables in `public`.
-- Idempotent: safe to run more than once. Reversible: see 0001_ops_schema.down.sql.
-- Primary keys reuse the existing string ids from the Blob snapshot so every
-- record is traceable back to its source row.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS ops;

-- Bumps updated_at and row_version on every UPDATE. row_version is the
-- optimistic-concurrency token: writers send the version they read and update
-- with `WHERE id = $1 AND row_version = $2`; zero rows affected = conflict.
CREATE OR REPLACE FUNCTION ops.touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;

-- Rejects UPDATE/DELETE on append-only evidence tables (audit trail integrity).
CREATE OR REPLACE FUNCTION ops.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ops.%: rows are append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;

-- ── Reference data ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.simulator (
  id                text PRIMARY KEY,
  code              text NOT NULL,
  name              text NOT NULL,
  location          text NOT NULL DEFAULT '',
  active            boolean NOT NULL DEFAULT true,
  program           text,
  simulator_type    text,
  site_airport      text,
  coverage_area     text,
  generation        text,
  transition_status text,
  replaced_by       text,
  notes             text,
  sort_order        integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS simulator_code_uq ON ops.simulator (upper(code));

CREATE TABLE IF NOT EXISTS ops.position (
  id             text PRIMARY KEY,
  code           text NOT NULL,
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  validity_days  integer NOT NULL CHECK (validity_days >= 0),
  program        text NOT NULL,
  group_name     text,
  category       text,
  simulator_unit text,
  airport        text,
  active         boolean NOT NULL DEFAULT true,
  sort_order     integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS position_program_code_uq ON ops.position (program, upper(code));

CREATE TABLE IF NOT EXISTS ops.qualification (
  id          text PRIMARY KEY,
  code        text NOT NULL,
  name        text NOT NULL,
  effect      text NOT NULL CHECK (effect IN ('allow', 'restrict')),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS qualification_code_uq ON ops.qualification (upper(code));

CREATE TABLE IF NOT EXISTS ops.assignment_code (
  id          text PRIMARY KEY,
  code        text NOT NULL,
  description text NOT NULL DEFAULT '',
  group_name  text NOT NULL DEFAULT '',
  type        text NOT NULL DEFAULT '',
  applies_to  text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_code_code_uq ON ops.assignment_code (upper(code));

CREATE TABLE IF NOT EXISTS ops.slot_time (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  start_time text NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  end_time   text NOT NULL CHECK (end_time ~ '^\d{2}:\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ops.public_holiday (
  id   text PRIMARY KEY,
  date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS public_holiday_date_idx ON ops.public_holiday (date);

-- ── Staff and access ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.staff (
  id         text PRIMARY KEY,
  initials   text NOT NULL,
  first_name text NOT NULL,
  last_name  text NOT NULL,
  rank       text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  phone      text NOT NULL DEFAULT '',
  active     boolean NOT NULL DEFAULT true,
  joined     date,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_initials_uq ON ops.staff (upper(initials));
CREATE UNIQUE INDEX IF NOT EXISTS staff_email_uq ON ops.staff (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS ops.staff_program (
  staff_id text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  program  text NOT NULL,
  PRIMARY KEY (staff_id, program)
);

CREATE TABLE IF NOT EXISTS ops.staff_home_position (
  staff_id    text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  position_id text NOT NULL REFERENCES ops.position (id) ON DELETE RESTRICT,
  ordinal     integer NOT NULL,
  PRIMARY KEY (staff_id, position_id)
);
CREATE INDEX IF NOT EXISTS staff_home_position_position_idx ON ops.staff_home_position (position_id);

CREATE TABLE IF NOT EXISTS ops.staff_qualification (
  id               text PRIMARY KEY,
  staff_id         text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  qualification_id text NOT NULL REFERENCES ops.qualification (id) ON DELETE RESTRICT,
  expiry           date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  UNIQUE (staff_id, qualification_id)
);
CREATE INDEX IF NOT EXISTS staff_qualification_qual_idx ON ops.staff_qualification (qualification_id);

-- Position currency / validity ("eligibility" is derived from this + quals).
CREATE TABLE IF NOT EXISTS ops.staff_validity (
  staff_id      text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  position_id   text NOT NULL REFERENCES ops.position (id) ON DELETE CASCADE,
  last_date_sat date,
  validity_days integer NOT NULL CHECK (validity_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (staff_id, position_id)
);
CREATE INDEX IF NOT EXISTS staff_validity_position_idx ON ops.staff_validity (position_id);

-- Application user profiles from the snapshot (distinct from public."user",
-- which holds Better Auth credentials). Linked by email at cutover.
CREATE TABLE IF NOT EXISTS ops.app_user (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL,
  role       text NOT NULL CHECK (role IN ('SP', 'SUP', 'SOO', 'STO', 'TL', 'Admin')),
  staff_id   text REFERENCES ops.staff (id) ON DELETE SET NULL,
  active     boolean NOT NULL DEFAULT true,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_uq ON ops.app_user (lower(email));

CREATE TABLE IF NOT EXISTS ops.role_permission (
  role       text NOT NULL CHECK (role IN ('SP', 'SUP', 'SOO', 'STO', 'TL', 'Admin')),
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  PRIMARY KEY (role, permission)
);

-- ── Exercises, courses, rules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.exercise (
  id             text PRIMARY KEY,
  code           text NOT NULL,
  name           text NOT NULL,
  program        text NOT NULL,
  description    text NOT NULL DEFAULT '',
  duration_min   integer NOT NULL CHECK (duration_min >= 0),
  simulator_id   text NOT NULL REFERENCES ops.simulator (id) ON DELETE RESTRICT,
  required_staff integer NOT NULL CHECK (required_staff >= 0),
  is_validation  boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
-- Mirrors dedupeExercises(): exercise names are unique case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_name_uq ON ops.exercise (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS exercise_simulator_idx ON ops.exercise (simulator_id);

-- Ordered seat list; a position may legitimately appear more than once.
CREATE TABLE IF NOT EXISTS ops.exercise_required_position (
  exercise_id text NOT NULL REFERENCES ops.exercise (id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  position_id text NOT NULL REFERENCES ops.position (id) ON DELETE RESTRICT,
  PRIMARY KEY (exercise_id, ordinal)
);

CREATE TABLE IF NOT EXISTS ops.exercise_qual_rule (
  id          text PRIMARY KEY,
  exercise_id text NOT NULL UNIQUE REFERENCES ops.exercise (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ops.exercise_qual_rule_item (
  rule_id          text NOT NULL REFERENCES ops.exercise_qual_rule (id) ON DELETE CASCADE,
  qualification_id text NOT NULL REFERENCES ops.qualification (id) ON DELETE RESTRICT,
  kind             text NOT NULL CHECK (kind IN ('required', 'preferred', 'excluded')),
  PRIMARY KEY (rule_id, qualification_id, kind)
);

CREATE TABLE IF NOT EXISTS ops.course (
  id              text PRIMARY KEY,
  code            text NOT NULL,
  name            text NOT NULL,
  program         text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('exercise', 'training')),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  required_people integer NOT NULL CHECK (required_people >= 0),
  notes           text,
  active          boolean NOT NULL DEFAULT true,
  cancelled       boolean NOT NULL DEFAULT false,
  sim_class       text CHECK (sim_class IN ('operational', 'non-operational')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS course_dates_idx ON ops.course (start_date, end_date);

CREATE TABLE IF NOT EXISTS ops.course_exercise (
  course_id   text NOT NULL REFERENCES ops.course (id) ON DELETE CASCADE,
  exercise_id text NOT NULL REFERENCES ops.exercise (id) ON DELETE RESTRICT,
  ordinal     integer NOT NULL,
  PRIMARY KEY (course_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS course_exercise_exercise_idx ON ops.course_exercise (exercise_id);

-- ── Runs, seating plans, status history ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.run (
  id                  text PRIMARY KEY,
  date                date NOT NULL,
  slot_time           text NOT NULL,
  simulator_id        text NOT NULL REFERENCES ops.simulator (id) ON DELETE RESTRICT,
  exercise_id         text NOT NULL REFERENCES ops.exercise (id) ON DELETE RESTRICT,
  status              text NOT NULL CHECK (status IN ('tentative', 'confirmed', 'cancelled', 'postponed', 'completed')),
  required_staff      integer CHECK (required_staff >= 0),
  notes               text,
  cancellation_reason text,
  status_changed_by   text,
  status_changed_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS run_date_idx ON ops.run (date);
CREATE INDEX IF NOT EXISTS run_simulator_date_idx ON ops.run (simulator_id, date, slot_time);
CREATE INDEX IF NOT EXISTS run_exercise_idx ON ops.run (exercise_id);

CREATE TABLE IF NOT EXISTS ops.run_required_position (
  run_id      text NOT NULL REFERENCES ops.run (id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  position_id text NOT NULL REFERENCES ops.position (id) ON DELETE RESTRICT,
  PRIMARY KEY (run_id, ordinal)
);

-- Seating plan: one row per seat in a run.
CREATE TABLE IF NOT EXISTS ops.run_assignment (
  id                 text PRIMARY KEY,
  run_id             text NOT NULL REFERENCES ops.run (id) ON DELETE CASCADE,
  position_id        text NOT NULL REFERENCES ops.position (id) ON DELETE RESTRICT,
  staff_id           text REFERENCES ops.staff (id) ON DELETE SET NULL,
  manual_override    boolean NOT NULL DEFAULT false,
  override_reason    text,
  linked_position_id text REFERENCES ops.position (id) ON DELETE SET NULL,
  training_mode      boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  CHECK (NOT manual_override OR override_reason IS NULL OR length(override_reason) > 0)
);
CREATE INDEX IF NOT EXISTS run_assignment_run_idx ON ops.run_assignment (run_id);
CREATE INDEX IF NOT EXISTS run_assignment_staff_idx ON ops.run_assignment (staff_id) WHERE staff_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ops.run_status_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id      text NOT NULL REFERENCES ops.run (id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  reason      text,
  changed_by  text,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'migration'))
);
CREATE INDEX IF NOT EXISTS run_status_history_run_idx ON ops.run_status_history (run_id, changed_at);

-- ── Leave and other tasks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.leave_record (
  id         text PRIMARY KEY,
  staff_id   text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('Annual', 'Sick', 'Training', 'Course', 'Compassionate', 'Other')),
  start_date date NOT NULL,
  end_date   date NOT NULL,
  full_day   boolean NOT NULL DEFAULT true,
  approval   text NOT NULL CHECK (approval IN ('pending', 'approved', 'rejected')),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS leave_record_staff_dates_idx ON ops.leave_record (staff_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS ops.other_task (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  description  text,
  start_date   date NOT NULL,
  start_time   text,
  end_date     date NOT NULL,
  end_time     text,
  duration_min integer CHECK (duration_min >= 0),
  classroom    text,
  program      text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS other_task_dates_idx ON ops.other_task (start_date, end_date);

CREATE TABLE IF NOT EXISTS ops.other_task_staff (
  task_id  text NOT NULL REFERENCES ops.other_task (id) ON DELETE CASCADE,
  staff_id text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, staff_id)
);
CREATE INDEX IF NOT EXISTS other_task_staff_staff_idx ON ops.other_task_staff (staff_id);

-- ── Training ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.training_group (
  id      text PRIMARY KEY,
  label   text NOT NULL,
  program text NOT NULL CHECK (program IN ('RADAR', 'TOWER')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ops.training_group_position (
  group_id    text NOT NULL REFERENCES ops.training_group (id) ON DELETE CASCADE,
  position_id text NOT NULL REFERENCES ops.position (id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  PRIMARY KEY (group_id, position_id)
);

CREATE TABLE IF NOT EXISTS ops.training_session (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  type          text NOT NULL,
  date          date NOT NULL,
  slot_time     text NOT NULL,
  instructor_id text NOT NULL REFERENCES ops.staff (id) ON DELETE RESTRICT,
  simulator_id  text REFERENCES ops.simulator (id) ON DELETE SET NULL,
  duration_min  integer CHECK (duration_min >= 0),
  linked_run_id text REFERENCES ops.run (id) ON DELETE SET NULL,
  notes         text,
  status        text CHECK (status IN ('scheduled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS training_session_date_idx ON ops.training_session (date);
CREATE INDEX IF NOT EXISTS training_session_instructor_idx ON ops.training_session (instructor_id);

CREATE TABLE IF NOT EXISTS ops.training_session_position (
  session_id  text NOT NULL REFERENCES ops.training_session (id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  position_id text NOT NULL REFERENCES ops.position (id) ON DELETE RESTRICT,
  PRIMARY KEY (session_id, ordinal)
);

CREATE TABLE IF NOT EXISTS ops.training_attendance (
  id         text PRIMARY KEY,
  session_id text NOT NULL REFERENCES ops.training_session (id) ON DELETE CASCADE,
  staff_id   text NOT NULL REFERENCES ops.staff (id) ON DELETE CASCADE,
  attended   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1,
  UNIQUE (session_id, staff_id)
);
CREATE INDEX IF NOT EXISTS training_attendance_staff_idx ON ops.training_attendance (staff_id);

CREATE TABLE IF NOT EXISTS ops.training_log (
  id               text PRIMARY KEY,
  date             date NOT NULL,
  program          text NOT NULL CHECK (program IN ('RADAR', 'TOWER')),
  group_id         text NOT NULL REFERENCES ops.training_group (id) ON DELETE RESTRICT,
  ojti_id          text NOT NULL REFERENCES ops.staff (id) ON DELETE RESTRICT,
  trainee_id       text NOT NULL REFERENCES ops.staff (id) ON DELETE RESTRICT,
  hours            numeric(5, 2) NOT NULL CHECK (hours >= 0),
  rating           smallint CHECK (rating BETWEEN 1 AND 5),
  strengths        text,
  areas_to_improve text,
  feedback         text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS training_log_trainee_idx ON ops.training_log (trainee_id, date);
CREATE INDEX IF NOT EXISTS training_log_ojti_idx ON ops.training_log (ojti_id, date);

CREATE TABLE IF NOT EXISTS ops.training_log_position (
  log_id      text NOT NULL REFERENCES ops.training_log (id) ON DELETE CASCADE,
  position_id text NOT NULL REFERENCES ops.position (id) ON DELETE RESTRICT,
  PRIMARY KEY (log_id, position_id)
);

-- File metadata only; bytes stay in private Blob storage.
-- The same file id can be attached to a session AND forwarded in a message,
-- so the row key is surrogate and uniqueness is per owner.
CREATE TABLE IF NOT EXISTS ops.attachment (
  row_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id              text NOT NULL,
  session_id      text REFERENCES ops.training_session (id) ON DELETE CASCADE,
  notification_id text,
  name            text NOT NULL,
  pathname        text NOT NULL,
  url             text NOT NULL,
  content_type    text NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  uploaded_at     timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK ((session_id IS NULL) <> (notification_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS attachment_session_uq ON ops.attachment (session_id, id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attachment_notification_uq ON ops.attachment (notification_id, id) WHERE notification_id IS NOT NULL;

-- ── Notifications ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.notification (
  id        text PRIMARY KEY,
  staff_id  text REFERENCES ops.staff (id) ON DELETE SET NULL,
  channel   text NOT NULL CHECK (channel IN ('email', 'sms', 'copy')),
  kind      text NOT NULL CHECK (kind IN ('assignment', 'weekly', 'daily', 'training', 'custom')),
  subject   text NOT NULL,
  body      text NOT NULL,
  recipient text NOT NULL,
  sent_at   timestamptz NOT NULL,
  sent_by   text NOT NULL,
  simulated boolean NOT NULL DEFAULT false,
  read_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_staff_idx ON ops.notification (staff_id, sent_at DESC);

DO $$ BEGIN
  ALTER TABLE ops.attachment
    ADD CONSTRAINT attachment_notification_fk FOREIGN KEY (notification_id) REFERENCES ops.notification (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ops.notify_dirty (
  key         text PRIMARY KEY,
  changed_at  timestamptz NOT NULL,
  notified_at timestamptz
);

-- ── Evidence / logs (append-only) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.audit_event (
  id          text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  actor       text NOT NULL,
  action      text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  entity_type text,
  entity_id   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_event_time_idx ON ops.audit_event (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_entity_idx ON ops.audit_event (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS ops.admin_log (
  id          text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  actor       text NOT NULL,
  action      text NOT NULL,
  target      text,
  detail      text NOT NULL DEFAULT '',
  ip_address  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_log_time_idx ON ops.admin_log (occurred_at DESC);

CREATE TABLE IF NOT EXISTS ops.fault_log (
  id          text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
  status      text NOT NULL CHECK (status IN ('open', 'in-progress', 'resolved', 'closed')),
  system      text NOT NULL,
  description text NOT NULL,
  reported_by text NOT NULL,
  resolved_at timestamptz,
  resolution  text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_by text, row_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS fault_log_time_idx ON ops.fault_log (occurred_at DESC);

CREATE TABLE IF NOT EXISTS ops.operator_log (
  id            text PRIMARY KEY,
  occurred_at   timestamptz NOT NULL,
  shift         text NOT NULL CHECK (shift IN ('morning', 'afternoon', 'night')),
  operator      text NOT NULL,
  category      text NOT NULL CHECK (category IN ('briefing', 'run', 'handover', 'incident', 'maintenance', 'note')),
  entry         text NOT NULL,
  linked_run_id text REFERENCES ops.run (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_log_time_idx ON ops.operator_log (occurred_at DESC);

CREATE TABLE IF NOT EXISTS ops.firewall_log (
  id             text PRIMARY KEY,
  occurred_at    timestamptz NOT NULL,
  action         text NOT NULL CHECK (action IN ('allow', 'deny', 'drop', 'alert')),
  source_ip      text NOT NULL,
  destination_ip text NOT NULL,
  port           integer NOT NULL CHECK (port BETWEEN 0 AND 65535),
  protocol       text NOT NULL,
  rule           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firewall_log_time_idx ON ops.firewall_log (occurred_at DESC);

CREATE TABLE IF NOT EXISTS ops.import_history (
  id            text PRIMARY KEY,
  filename      text NOT NULL,
  imported_at   timestamptz NOT NULL,
  actor         text NOT NULL,
  rows_total    integer NOT NULL CHECK (rows_total >= 0),
  rows_accepted integer NOT NULL CHECK (rows_accepted >= 0),
  rows_rejected integer NOT NULL CHECK (rows_rejected >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Migration provenance ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.migration_run (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  mode           text NOT NULL CHECK (mode IN ('dry-run', 'commit')),
  source_path    text NOT NULL,
  source_etag    text NOT NULL,
  source_sha256  text NOT NULL,
  source_version integer,
  backup_path    text,
  counts         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL CHECK (status IN ('running', 'verified', 'failed')),
  executed_by    text NOT NULL
);

-- Records that could not be migrated (orphans, test fixtures) are preserved
-- verbatim here instead of being silently dropped.
CREATE TABLE IF NOT EXISTS ops.migration_quarantine (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration_run_id bigint NOT NULL REFERENCES ops.migration_run (id) ON DELETE CASCADE,
  slice            text NOT NULL,
  record_id        text,
  reason           text NOT NULL,
  payload          jsonb NOT NULL
);

-- ── Triggers ────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulator','position','qualification','assignment_code','slot_time','public_holiday',
    'staff','staff_qualification','staff_validity','app_user','exercise','exercise_qual_rule',
    'course','run','run_assignment','leave_record','other_task','training_group',
    'training_session','training_attendance','training_log','fault_log'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON ops.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON ops.%I FOR EACH ROW EXECUTE FUNCTION ops.touch_row()', t || '_touch', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['audit_event','admin_log','run_status_history','operator_log','firewall_log','import_history'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON ops.%I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON ops.%I FOR EACH ROW EXECUTE FUNCTION ops.forbid_mutation()', t || '_append_only', t);
  END LOOP;
END $$;

-- Destroys audit evidence. Only for tearing down a non-production environment;
-- export the table first if the records must be retained.
DROP TRIGGER IF EXISTS audit_event_no_truncate ON audit.event;
DROP TRIGGER IF EXISTS audit_event_no_update ON audit.event;
DROP TABLE IF EXISTS audit.event;
DROP FUNCTION IF EXISTS audit.forbid_mutation();
DROP SCHEMA IF EXISTS audit;

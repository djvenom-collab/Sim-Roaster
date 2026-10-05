-- Destroys the risk register. Export it first (GET /api/risks) and record the
-- removal in the audit trail; this is not reversible.
DROP SCHEMA IF EXISTS risk CASCADE;

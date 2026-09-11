-- ============================================================
-- Migración 009 — Rastro de quién inició cada jornada
-- Para poder ver, la próxima vez que algo se corte, si fue por un
-- reinicio real y quién lo hizo — en vez de tener que adivinar.
-- ============================================================
alter table jornadas
  add column if not exists creado_por text;

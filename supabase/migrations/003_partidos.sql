-- ============================================================
-- Migración 003 — Partidos (cronómetro, marcador, cola de equipos)
-- Ejecutar en el SQL Editor de Supabase, después de 002_draft.sql.
-- Segura de correr aunque ya la hayas aplicado (usa IF NOT EXISTS).
-- ============================================================

alter table mini_partidos
  add column if not exists inicio_ts timestamptz,
  add column if not exists duracion_seg int not null default 600;

alter table equipos_jornada
  add column if not exists orden_cola int;

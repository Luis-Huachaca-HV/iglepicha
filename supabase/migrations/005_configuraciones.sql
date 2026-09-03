-- ============================================================
-- Migración 005 — Configuraciones
-- Ejecutar en el SQL Editor de Supabase, después de 004_cobranza.sql.
-- Segura de correr aunque ya la hayas aplicado (usa IF NOT EXISTS).
-- ============================================================

alter table jornadas
  add column if not exists duracion_mini_partido_seg int not null default 600;

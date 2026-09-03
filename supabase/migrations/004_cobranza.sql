-- ============================================================
-- Migración 004 — Cobranza
-- Ejecutar en el SQL Editor de Supabase, después de 003_partidos.sql.
-- Segura de correr aunque ya la hayas aplicado (usa IF NOT EXISTS).
-- No agrega columnas nuevas: Cobranza reutiliza jornadas.costo_total,
-- equipos_jornada.cuota_equipo y asistencia_draft.pago_realizado, que
-- ya existían desde el schema inicial.
-- ============================================================
select 1; -- no-op: sin cambios de esquema, este archivo queda como referencia

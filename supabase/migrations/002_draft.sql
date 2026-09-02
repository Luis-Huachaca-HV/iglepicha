-- ============================================================
-- Migración 002 — Draft
-- Ejecutar en el SQL Editor de Supabase (después de schema.sql).
-- Es segura de correr aunque ya la hayas aplicado antes (usa IF NOT EXISTS).
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'estado_draft') then
    create type estado_draft as enum ('no_iniciado', 'en_curso', 'finalizado');
  end if;
end $$;

alter table jornadas
  add column if not exists draft_estado estado_draft not null default 'no_iniciado',
  add column if not exists draft_turno_equipo_id uuid references equipos_jornada(id_equipo),
  add column if not exists permitir_cambios_post_draft boolean not null default false;

alter table equipos_jornada
  add column if not exists cupo_max int,
  add column if not exists orden_turno int;

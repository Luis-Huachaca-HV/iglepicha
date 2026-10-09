-- ============================================================
-- Migración 011 — Cupo base del draft
-- Ejecutar en el SQL Editor de Supabase.
-- Guarda el cupo original (ej. 6) aparte del cupo real, que puede
-- subir a 7 cuando un jugador llega después de llenar los equipos.
-- Es segura de correr más de una vez.
-- ============================================================

alter table equipos_jornada
  add column if not exists cupo_base int;

-- Lo ya sorteado conserva como base el cupo que tenía guardado.
update equipos_jornada
set cupo_base = cupo_max
where cupo_base is null
  and cupo_max is not null;

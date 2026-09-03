-- ============================================================
-- Migración 006 — Habilitar Realtime (replicación) en las tablas
-- que la app necesita escuchar en vivo.
--
-- Esto es la causa raíz de "no se actualiza en tiempo real": el código
-- ya estaba suscrito correctamente, pero Supabase no envía ningún aviso
-- a menos que la tabla esté agregada a la publicación 'supabase_realtime'
-- — es un interruptor a nivel de base de datos, no de código. Antes esto
-- solo se podía activar a mano en Database → Replication en el dashboard;
-- este script lo deja garantizado sin tocar nada ahí.
--
-- Segura de correr aunque ya la hayas aplicado (revisa antes de agregar).
-- ============================================================

do $$
declare
  tabla text;
begin
  foreach tabla in array array['usuarios','jornadas','equipos_jornada','asistencia_draft','mini_partidos','eventos_partido']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabla);
    end if;
  end loop;
end $$;

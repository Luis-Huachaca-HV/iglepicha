-- ============================================================
-- Migración 010 — No publicar hashes de PIN por Realtime
--
-- La tabla usuarios tiene lectura pública para el selector de login. RLS
-- protege filas, no columnas, por lo que publicar cambios de esta tabla
-- podría exponer pin_hash a navegadores anónimos. La app ahora obtiene una
-- lista segura desde /api/usuarios y la refresca por sondeo.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'usuarios'
  ) then
    alter publication supabase_realtime drop table public.usuarios;
  end if;
end $$;

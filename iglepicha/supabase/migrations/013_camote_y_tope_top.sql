-- ============================================================
-- 013 — "Camote" (menores de 12) y tope de jugadores top por equipo
-- Repositorio: iglepicha (Next.js + Cloudflare). NO es una migración
-- de Cosmos: pégala en Supabase → SQL Editor → New query → Run.
-- Segura de correr más de una vez. No borra ni modifica datos existentes.
-- ============================================================

-- 1) Camote: atributo del jugador (no de la jornada).
--    Solo puede marcarse si el jugador tiene edad registrada y es menor de 12.
alter table public.usuarios
  add column if not exists es_camote boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_camote_menor_de_12'
      and conrelid = 'public.usuarios'::regclass
  ) then
    alter table public.usuarios
      add constraint usuarios_camote_menor_de_12
      check (es_camote = false or (edad is not null and edad < 12));
  end if;
end $$;

-- 2) Tope de jugadores top por equipo durante el draft y los intercambios.
--    NULL = automático: ceil(tops presentes / cantidad de equipos).
--    El admin puede forzar un número fijo (1 o 2) para una jornada concreta.
alter table public.jornadas
  add column if not exists max_tops_por_equipo integer
    check (max_tops_por_equipo is null or max_tops_por_equipo >= 1);

-- 3) Umbral de valoración promedio (sobre los 9 atributos) a partir del
--    cual un jugador cuenta como "top". Por defecto 7.5.
alter table public.jornadas
  add column if not exists umbral_top numeric(4,2) not null default 7.5
    check (umbral_top >= 0 and umbral_top <= 10);

-- 4) Índice para el reparto de camotes y la cobranza (filtra por es_camote).
create index if not exists usuarios_es_camote_idx
  on public.usuarios (es_camote)
  where es_camote = true;

-- Verificación rápida (opcional): debe devolver las 3 columnas nuevas.
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where (table_name = 'usuarios' and column_name = 'es_camote')
--    or (table_name = 'jornadas' and column_name in ('max_tops_por_equipo', 'umbral_top'));

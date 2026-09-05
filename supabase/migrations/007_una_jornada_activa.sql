-- ============================================================
-- Migración 007 — Evita que existan 2 jornadas "activas" a la vez
--
-- Causa del bug "el draft se reinicia": si dos pantallas consultaban
-- /api/jornada/active al mismo tiempo cuando todavía no había ninguna
-- jornada, cada una podía crear la suya por su cuenta — dejando dos
-- jornadas no-finalizadas en la tabla. La pantalla que terminaba
-- apuntando a la jornada "vieja" (recién creada, sin draft) parecía
-- haberse reiniciado, aunque la otra jornada con el draft real seguía
-- intacta.
--
-- Este índice único hace que Postgres RECHACE cualquier intento de
-- crear una segunda jornada mientras ya haya una sin finalizar.
-- ============================================================

-- Limpieza primero: si ya quedaron 2+ jornadas sin finalizar por el bug
-- de la carrera, nos quedamos con la que tiene más equipos armados (la
-- real, con el draft en progreso) y borramos las demás duplicadas.
do $$
declare
  id_a_mantener uuid;
begin
  select j.id_jornada into id_a_mantener
  from jornadas j
  left join equipos_jornada e on e.id_jornada = j.id_jornada
  where j.estado <> 'finalizada'
  group by j.id_jornada
  order by count(e.id_equipo) desc, j.creado_en asc
  limit 1;

  if id_a_mantener is not null then
    delete from jornadas
    where estado <> 'finalizada' and id_jornada <> id_a_mantener;
  end if;
end $$;

create unique index if not exists una_jornada_no_finalizada
  on jornadas ((true))
  where estado <> 'finalizada';

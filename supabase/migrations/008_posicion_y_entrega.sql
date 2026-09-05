-- ============================================================
-- Migración 008 — Posición de jugador + entrega de cobranza capitán→admin
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'posicion_jugador') then
    create type posicion_jugador as enum ('POR', 'DEF', 'MC', 'DEL');
  end if;
end $$;

alter table usuarios
  add column if not exists posicion posicion_jugador;

-- Cobranza de dos niveles: además de que cada jugador le paga a su
-- capitán (asistencia_draft.pago_realizado, ya existía), el capitán le
-- entrega el total de su equipo al admin. Esto se marca acá.
alter table equipos_jornada
  add column if not exists pago_entregado_admin boolean not null default false;

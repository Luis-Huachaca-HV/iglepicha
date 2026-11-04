-- 013 — "Camote" (menores de 12) y tope de jugadores top por equipo

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

alter table public.jornadas
  add column if not exists max_tops_por_equipo integer
    check (max_tops_por_equipo is null or max_tops_por_equipo >= 1);

alter table public.jornadas
  add column if not exists umbral_top numeric(4,2) not null default 7.5
    check (umbral_top >= 0 and umbral_top <= 10);

create index if not exists usuarios_es_camote_idx
  on public.usuarios (es_camote)
  where es_camote = true;

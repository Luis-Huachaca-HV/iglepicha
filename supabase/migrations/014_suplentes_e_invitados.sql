-- 014 — Orden de llegada (30 titulares + suplentes) e Invitados por jornada

alter table public.asistencia_draft
  add column if not exists es_invitado boolean not null default false,
  add column if not exists marcado_en timestamptz;

update public.asistencia_draft
set marcado_en = now()
where presente = true and marcado_en is null;

create or replace function public.fn_asistencia_marcado_en()
returns trigger
language plpgsql
as $$
begin
  if new.presente = true and (tg_op = 'INSERT' or old.presente is distinct from true or old.marcado_en is null) then
    new.marcado_en := coalesce(new.marcado_en, clock_timestamp());
  elsif new.presente = false then
    new.marcado_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asistencia_marcado_en on public.asistencia_draft;

create trigger trg_asistencia_marcado_en
before insert or update on public.asistencia_draft
for each row
execute function public.fn_asistencia_marcado_en();

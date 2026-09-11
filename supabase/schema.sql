-- ============================================================
-- App_Gestion_Pichangas — Schema (Auth + Dashboard + Jugadores + Draft + Partidos + Cobranza + Configuraciones)
-- Incluye ya las tablas del spec completo (Jornadas, Equipos, Draft, Partidos,
-- Eventos) para que el resto de tabs se puedan construir sin migrar de nuevo.
-- Si tu proyecto Supabase ya corrió una versión anterior de este archivo,
-- NO vuelvas a correr este completo — corre en orden solo los archivos
-- nuevos que te falten dentro de supabase/migrations/ (002_draft.sql,
-- 003_partidos.sql, etc.)
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
-- ============================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ---------- Usuarios ----------
create type rol_sistema as enum ('super_admin', 'admin', 'capitan', 'jugador_registrado');
create type posicion_jugador as enum ('POR', 'DEF', 'MC', 'DEL');

create table usuarios (
  id_usuario uuid primary key default gen_random_uuid(),
  nombre text not null,
  edad int,
  rol_sistema rol_sistema not null default 'jugador_registrado',
  posicion posicion_jugador,
  -- PIN de 4 dígitos, solo requerido para super_admin / admin / capitan.
  -- Guardado hasheado (ver nota de seguridad en README) — nunca en texto plano en producción.
  pin_hash text,
  creado_en timestamptz not null default now()
);

-- ---------- Jornadas (una "pichanga" / evento) ----------
create type estado_jornada as enum ('pendiente', 'en_curso', 'finalizada');
create type estado_draft as enum ('no_iniciado', 'en_curso', 'finalizado');

create table jornadas (
  id_jornada uuid primary key default gen_random_uuid(),
  estado estado_jornada not null default 'pendiente',
  tiempo_total_seg int not null default 7200, -- 2 horas por defecto
  inicio_ts timestamptz,
  costo_total numeric(10,2) default 0,
  -- Draft
  draft_estado estado_draft not null default 'no_iniciado',
  draft_turno_equipo_id uuid, -- referencia a equipos_jornada, se agrega FK más abajo
  permitir_cambios_post_draft boolean not null default false,
  -- Configuraciones: duración por defecto de cada mini-partido (Partidos)
  duracion_mini_partido_seg int not null default 600,
  -- Auditoría: quién creó/reinició esta jornada (nombre, no FK — así se
  -- conserva el rastro aunque el usuario cambie de nombre o se borre).
  creado_por text,
  creado_en timestamptz not null default now()
);

-- ---------- Equipos por jornada ----------
create table equipos_jornada (
  id_equipo uuid primary key default gen_random_uuid(),
  id_jornada uuid not null references jornadas(id_jornada) on delete cascade,
  id_capitan uuid references usuarios(id_usuario),
  color_nombre text,
  cuota_equipo numeric(10,2) default 0,
  -- Draft: cupo máximo de jugadores y orden en la ronda de turnos
  cupo_max int,
  orden_turno int,
  -- Partidos: posición en la cola de "el que gana se queda" (null = jugando o sin iniciar cola)
  orden_cola int,
  -- Cobranza: si el capitán ya le entregó el total de su equipo al admin
  pago_entregado_admin boolean not null default false
);

alter table jornadas
  add constraint jornadas_draft_turno_equipo_fk
  foreign key (draft_turno_equipo_id) references equipos_jornada(id_equipo);

-- ---------- Asistencia / Draft ----------
create table asistencia_draft (
  id_asistencia uuid primary key default gen_random_uuid(),
  id_jornada uuid not null references jornadas(id_jornada) on delete cascade,
  id_usuario uuid not null references usuarios(id_usuario) on delete cascade,
  id_equipo uuid references equipos_jornada(id_equipo),
  presente boolean not null default false,
  pago_realizado boolean not null default false,
  unique (id_jornada, id_usuario)
);

-- ---------- Mini-partidos dentro de una jornada ----------
create type estado_partido as enum ('pendiente', 'en_curso', 'finalizado');

create table mini_partidos (
  id_partido uuid primary key default gen_random_uuid(),
  id_jornada uuid not null references jornadas(id_jornada) on delete cascade,
  id_equipo_a uuid references equipos_jornada(id_equipo),
  id_equipo_b uuid references equipos_jornada(id_equipo),
  estado estado_partido not null default 'pendiente',
  marcador_a int not null default 0,
  marcador_b int not null default 0,
  -- Cronómetro del mini-partido
  inicio_ts timestamptz,
  duracion_seg int not null default 600
);

-- ---------- Eventos de partido (goles, faltas, etc.) ----------
create table eventos_partido (
  id_evento uuid primary key default gen_random_uuid(),
  id_partido uuid not null references mini_partidos(id_partido) on delete cascade,
  accion text not null, -- 'gol', 'falta', etc.
  id_jugador uuid references usuarios(id_usuario),
  creado_en timestamptz not null default now()
);

-- ---------- Valoraciones (stats crowdsourced 1-10) ----------
create table valoraciones (
  id_valoracion uuid primary key default gen_random_uuid(),
  id_evaluado uuid not null references usuarios(id_usuario) on delete cascade,
  id_evaluador uuid not null references usuarios(id_usuario) on delete cascade,
  -- { velocidad, resistencia, ataque, defensa, pase_corto, pase_largo, regate, juego_equipo, agresividad }
  stats jsonb not null,
  creado_en timestamptz not null default now(),
  unique (id_evaluado, id_evaluador),
  check (id_evaluado <> id_evaluador) -- no se puede auto-evaluar
);

-- ============================================================
-- Row Level Security
-- La app NO usa Supabase Auth (login es por PIN custom vía API route con
-- la service role key), así que el cliente del navegador solo debe poder
-- LEER. Toda escritura pasa por las API routes del servidor.
-- ============================================================
alter table usuarios enable row level security;
alter table jornadas enable row level security;
alter table equipos_jornada enable row level security;
alter table asistencia_draft enable row level security;
alter table mini_partidos enable row level security;
alter table eventos_partido enable row level security;
alter table valoraciones enable row level security;

-- Lectura pública (anon key) para todo lo necesario en pantalla.
-- No exponemos pin_hash: se filtra en el select de la API, no aquí a nivel de RLS
-- (Postgres RLS no oculta columnas), así que las rutas del cliente deben
-- seleccionar columnas explícitas y nunca 'select *' sobre usuarios.
create policy "lectura publica usuarios" on usuarios for select using (true);
create policy "lectura publica jornadas" on jornadas for select using (true);
create policy "lectura publica equipos" on equipos_jornada for select using (true);
create policy "lectura publica asistencia" on asistencia_draft for select using (true);
create policy "lectura publica partidos" on mini_partidos for select using (true);
create policy "lectura publica eventos" on eventos_partido for select using (true);
create policy "lectura publica valoraciones" on valoraciones for select using (true);

-- Sin policies de insert/update/delete para el rol anon: toda escritura
-- se hace desde las API routes de Next.js usando la service role key,
-- que ignora RLS. Esto evita que cualquiera con la anon key pueda escribir.

-- ---------- Datos semilla opcionales para probar ----------
-- insert into usuarios (nombre, edad, rol_sistema, pin_hash) values
--   ('Axl', 30, 'super_admin', null); -- setear pin_hash real desde /login la primera vez

-- ============================================================
-- Realtime: sin esto, ninguna suscripción en vivo del código funciona
-- aunque esté bien escrita — es un interruptor a nivel de base de datos.
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

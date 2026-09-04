-- ============================================================
-- Reset manual: borra TODO lo relacionado a jornadas (equipos, draft,
-- asistencia, partidos, cobranza) y deja los PIN limpios de verdad.
-- NO toca la tabla usuarios — tus jugadores se quedan igual.
--
-- Correr en el SQL Editor de Supabase cuando quieras arrancar de cero,
-- como si nunca hubieras usado la app.
-- ============================================================

-- Borra todas las jornadas — por las relaciones "on delete cascade" del
-- schema, esto arrastra automáticamente equipos_jornada, asistencia_draft,
-- mini_partidos y eventos_partido. usuarios NO se toca.
delete from jornadas;

-- Deja un NULL de verdad en pin_hash para todos (no el texto "NULL").
-- Ya no es estrictamente necesario con el fix de código, pero deja la
-- tabla limpia.
update usuarios set pin_hash = null;

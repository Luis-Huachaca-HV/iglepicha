-- Ticket adicional de la jornada (check verde en Jugadores).
-- Lo lee Cobranza: (costo cancha / asistentes) + precio del ticket.
-- Seguro de correr más de una vez.

alter table asistencia_draft
  add column if not exists ticket_adicional boolean not null default false;

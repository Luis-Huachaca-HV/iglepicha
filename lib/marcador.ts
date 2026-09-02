import type { SupabaseClient } from "@supabase/supabase-js";

// Recalcula marcador_a / marcador_b de un partido contando los eventos
// 'gol' actuales y viendo a qué equipo pertenece cada jugador (según
// asistencia_draft de esa jornada). Se llama después de crear, editar
// o borrar cualquier evento, así el marcador nunca queda desincronizado.
export async function recalcularMarcador(admin: SupabaseClient, idPartido: string) {
  const { data: partido } = await admin.from("mini_partidos").select("*").eq("id_partido", idPartido).single();
  if (!partido) return null;

  const { data: eventos } = await admin
    .from("eventos_partido")
    .select("accion, id_jugador")
    .eq("id_partido", idPartido)
    .eq("accion", "gol");

  const { data: asistencias } = await admin
    .from("asistencia_draft")
    .select("id_usuario, id_equipo")
    .eq("id_jornada", partido.id_jornada);

  const equipoDeJugador: Record<string, string> = {};
  (asistencias || []).forEach((a) => {
    if (a.id_equipo) equipoDeJugador[a.id_usuario] = a.id_equipo;
  });

  let marcadorA = 0;
  let marcadorB = 0;
  (eventos || []).forEach((e) => {
    if (!e.id_jugador) return;
    const equipo = equipoDeJugador[e.id_jugador];
    if (equipo === partido.id_equipo_a) marcadorA += 1;
    else if (equipo === partido.id_equipo_b) marcadorB += 1;
  });

  const { data: actualizado } = await admin
    .from("mini_partidos")
    .update({ marcador_a: marcadorA, marcador_b: marcadorB })
    .eq("id_partido", idPartido)
    .select("*")
    .single();

  return actualizado;
}

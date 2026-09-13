import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/draft/elegir
// body: { id_jornada: string, id_equipo: string, id_usuario: string }
// Asigna un jugador de la bolsa al equipo cuyo turno es, y avanza el
// turno al siguiente equipo con cupo disponible. Si ya no queda cupo o
// bolsa, cierra el draft.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id_jornada, id_equipo, id_usuario } = (await req.json()) as {
    id_jornada?: string;
    id_equipo?: string;
    id_usuario?: string;
  };
  if (!id_jornada || !id_equipo || !id_usuario) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: jornada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).single();
  if (!jornada || jornada.draft_estado !== "en_curso") {
    return NextResponse.json({ error: "El draft no está en curso" }, { status: 400 });
  }
  if (jornada.draft_turno_equipo_id !== id_equipo) {
    return NextResponse.json({ error: "No es el turno de este equipo" }, { status: 409 });
  }

  const { data: equipoTurno } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_equipo", id_equipo)
    .single();
  if (!equipoTurno) {
    return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  }

  const esSuperAdmin = sesion.rol_sistema === "super_admin";
  const esCapitanDeTurno = sesion.id_usuario === equipoTurno.id_capitan;
  if (!esSuperAdmin && !esCapitanDeTurno) {
    return NextResponse.json({ error: "Solo el capitán en turno puede elegir" }, { status: 403 });
  }

  const { data: asistenciaJugador } = await admin
    .from("asistencia_draft")
    .select("*")
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario)
    .single();
  if (!asistenciaJugador || !asistenciaJugador.presente || asistenciaJugador.id_equipo) {
    return NextResponse.json({ error: "Ese jugador no está disponible" }, { status: 400 });
  }

  // Asigna el jugador
  const { error: asignarError } = await admin
    .from("asistencia_draft")
    .update({ id_equipo })
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario);
  if (asignarError) {
    if (asignarError.code === "23503") {
      return NextResponse.json(
        { error: "Esta jornada ya no existe (alguien la reinició) — recarga para ver la actual.", jornadaInvalida: true },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: asignarError.message }, { status: 500 });
  }

  // Recalcula el estado para decidir el siguiente turno
  const { data: equipos } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_jornada", id_jornada)
    .order("orden_turno", { ascending: true });
  const { count: enBolsa } = await admin
    .from("asistencia_draft")
    .select("*", { count: "exact", head: true })
    .eq("id_jornada", id_jornada)
    .eq("presente", true)
    .is("id_equipo", null);

  let siguienteEquipo: string | null = null;
  if ((enBolsa ?? 0) > 0 && equipos) {
    const idxActual = equipos.findIndex((e) => e.id_equipo === id_equipo);
    for (let paso = 1; paso <= equipos.length; paso++) {
      const candidato = equipos[(idxActual + paso) % equipos.length];
      const { count: ocupados } = await admin
        .from("asistencia_draft")
        .select("*", { count: "exact", head: true })
        .eq("id_jornada", id_jornada)
        .eq("id_equipo", candidato.id_equipo);
      if (!candidato.cupo_max || (ocupados ?? 0) < candidato.cupo_max) {
        siguienteEquipo = candidato.id_equipo;
        break;
      }
    }
  }

  const { data: jornadaActualizada } = await admin
    .from("jornadas")
    .update({
      draft_turno_equipo_id: siguienteEquipo,
      draft_estado: siguienteEquipo ? "en_curso" : "finalizado",
    })
    .eq("id_jornada", id_jornada)
    .select("*")
    .single();

  return NextResponse.json({ jornada: jornadaActualizada });
}

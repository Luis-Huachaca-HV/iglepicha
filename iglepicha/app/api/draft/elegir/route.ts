import { NextRequest, NextResponse } from "next/server";
import { cerrarOContinuarDraft } from "@/lib/draft-asignar";
import { colocarCamotes, leerReglasDraft, motivoBloqueo } from "@/lib/draft-reglas";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/draft/elegir
// body: { id_jornada: string, id_equipo: string, id_usuario: string }
// Asigna un jugador de la bolsa al equipo cuyo turno es, y avanza el
// turno al siguiente equipo con cupo disponible. Si los cupos base ya
// están llenos pero todavía hay gente en la bolsa, esa gente entra al
// azar a un equipo existente (el cupo de ese equipo pasa a N+1) y ahí
// sí se cierra el draft.
//
// Migración 013:
// - Tope de jugadores top por equipo (motivoBloqueo → 409 con el motivo).
// - Los Camotes no se eligen; al cerrar el draft se reparten solos con
//   colocarCamotes() y la respuesta incluye `camotes_sin_equipo` con los
//   que no alcanzaron equipo (más Camotes que equipos).
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

  // Reglas 013: tope de tops por equipo y Camotes fuera de la bolsa.
  const { reglas, error: errorReglas } = await leerReglasDraft(admin, id_jornada);
  if (errorReglas || !reglas) {
    return NextResponse.json({ error: errorReglas ?? "No se pudieron leer las reglas del draft" }, { status: 500 });
  }
  const bloqueo = motivoBloqueo(reglas, id_equipo, id_usuario);
  if (bloqueo) {
    return NextResponse.json({ error: bloqueo }, { status: 409 });
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

  const { siguienteEquipo, error: errorTurno } = await cerrarOContinuarDraft(admin, id_jornada, id_equipo);
  if (errorTurno) return NextResponse.json({ error: errorTurno }, { status: 500 });

  const { data: jornadaActualizada } = await admin
    .from("jornadas")
    .update({
      draft_turno_equipo_id: siguienteEquipo,
      draft_estado: siguienteEquipo ? "en_curso" : "finalizado",
    })
    .eq("id_jornada", id_jornada)
    .select("*")
    .single();

  // Draft cerrado: reparte a los Camotes (uno por equipo) y avisa si sobran.
  let camotesSinEquipo: string[] = [];
  if (!siguienteEquipo) {
    const camotes = await colocarCamotes(admin, id_jornada);
    if (camotes.error) return NextResponse.json({ error: camotes.error }, { status: 500 });
    camotesSinEquipo = camotes.sinEquipo;
  }

  return NextResponse.json({ jornada: jornadaActualizada, camotes_sin_equipo: camotesSinEquipo });
}

import { NextRequest, NextResponse } from "next/server";
import { cerrarOContinuarDraft } from "@/lib/draft-asignar";
import { colocarCamotes, colocarSuplentes, leerReglasDraft, motivoBloqueo } from "@/lib/draft-reglas";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

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

  const { data: jornada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).maybeSingle();
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
    .maybeSingle();
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
    .maybeSingle();
  if (!asistenciaJugador || !asistenciaJugador.presente || asistenciaJugador.id_equipo) {
    return NextResponse.json({ error: "Ese jugador no está disponible" }, { status: 400 });
  }

  const reglas = await leerReglasDraft(admin, id_jornada);
  if (reglas.camotesPresentes.has(id_usuario)) {
    return NextResponse.json(
      { error: "Los jugadores marcados como Camote se reparten automáticamente al finalizar el draft." },
      { status: 409 }
    );
  }
  if (reglas.suplentesPresentes.has(id_usuario)) {
    return NextResponse.json(
      { error: "Los jugadores suplentes (llegada 31+) se reparten por equilibrio al cerrar el draft o pasan al 6to equipo." },
      { status: 409 }
    );
  }

  const bloqueo = motivoBloqueo(reglas, id_equipo, id_usuario);
  if (bloqueo) {
    return NextResponse.json({ error: bloqueo }, { status: 409 });
  }

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

  let camotesSinEquipo: { id_usuario: string; nombre: string }[] = [];
  if (!siguienteEquipo) {
    await colocarSuplentes(admin, id_jornada);
    const resCamotes = await colocarCamotes(admin, id_jornada);
    camotesSinEquipo = resCamotes.sinEquipo;
  }

  const { data: jornadaActualizada } = await admin
    .from("jornadas")
    .update({
      draft_turno_equipo_id: siguienteEquipo,
      draft_estado: siguienteEquipo ? "en_curso" : "finalizado",
    })
    .eq("id_jornada", id_jornada)
    .select("*")
    .maybeSingle();

  return NextResponse.json({ jornada: jornadaActualizada, camotes_sin_equipo: camotesSinEquipo });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/jornada/estado
// body: { id_jornada: string, accion: "iniciar" | "finalizar" }
// Solo admin / super_admin pueden iniciar o cerrar una jornada.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, accion } = (await req.json()) as {
    id_jornada?: string;
    accion?: "iniciar" | "finalizar";
  };
  if (!id_jornada || !accion) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  if (accion === "iniciar") {
    const { data: equipos, error: equiposError } = await admin
      .from("equipos_jornada")
      .select("id_equipo, orden_turno")
      .eq("id_jornada", id_jornada)
      .order("orden_turno", { ascending: true });
    if (equiposError || !equipos || equipos.length < 2) {
      return NextResponse.json({ error: "Se necesitan al menos dos equipos para iniciar." }, { status: 400 });
    }

    // La jornada empieza únicamente después de terminar el draft. El update
    // condicional hace que solo un dispositivo pueda ganar el inicio.
    const { data: jornada, error } = await admin
      .from("jornadas")
      .update({ estado: "en_curso", inicio_ts: new Date().toISOString() })
      .eq("id_jornada", id_jornada)
      .eq("estado", "pendiente")
      .eq("draft_estado", "finalizado")
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!jornada) return NextResponse.json({ error: "Completa el draft antes de iniciar la jornada." }, { status: 400 });

    // El sorteo inicial ocurre al iniciar la jornada: los dos primeros del
    // orden del draft juegan y el resto forma la cola.
    for (const equipo of equipos) {
      await admin.from("equipos_jornada").update({ orden_cola: equipo.orden_turno ?? 0 }).eq("id_equipo", equipo.id_equipo);
    }
    const [equipoA, equipoB] = equipos;
    await admin.from("equipos_jornada").update({ orden_cola: null }).in("id_equipo", [equipoA.id_equipo, equipoB.id_equipo]);
    const { error: partidoError } = await admin.from("mini_partidos").insert({
      id_jornada,
      id_equipo_a: equipoA.id_equipo,
      id_equipo_b: equipoB.id_equipo,
      estado: "pendiente",
      duracion_seg: jornada.duracion_mini_partido_seg ?? 600,
    });
    if (partidoError) return NextResponse.json({ error: partidoError.message }, { status: 500 });
    return NextResponse.json({ jornada });
  }

  const { data, error } = await admin
    .from("jornadas")
    .update({ estado: "finalizada" })
    .eq("id_jornada", id_jornada)
    .eq("estado", "en_curso")
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "La jornada no está en curso." }, { status: 400 });
  return NextResponse.json({ jornada: data });
}

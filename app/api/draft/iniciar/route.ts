import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/draft/iniciar
// body: { id_jornada: string, cupos: Record<id_equipo, number> }
// Fija el cupo máximo y el orden de turno de cada equipo, asigna a cada
// capitán presente a su propio equipo, y arranca el draft en el primer
// equipo (por orden de creación).
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, cupos } = (await req.json()) as {
    id_jornada?: string;
    cupos?: Record<string, number>;
  };
  if (!id_jornada || !cupos || Object.keys(cupos).length < 2) {
    return NextResponse.json({ error: "Se necesitan al menos 2 equipos con cupo definido" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipos, error: equiposError } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_jornada", id_jornada)
    .order("orden_turno", { ascending: true, nullsFirst: true });
  if (equiposError || !equipos || equipos.length < 2) {
    return NextResponse.json({ error: "No hay suficientes equipos creados" }, { status: 400 });
  }

  // Fija cupo_max y orden_turno (por el orden en que ya vienen = creación)
  for (let i = 0; i < equipos.length; i++) {
    const equipo = equipos[i];
    const cupo = cupos[equipo.id_equipo];
    if (!cupo || cupo < 1) {
      return NextResponse.json({ error: `Falta cupo para un equipo` }, { status: 400 });
    }
    await admin.from("equipos_jornada").update({ cupo_max: cupo, orden_turno: i }).eq("id_equipo", equipo.id_equipo);
  }

  // Cada capitán queda asignado a su propio equipo (ocupa un cupo)
  for (const equipo of equipos) {
    if (!equipo.id_capitan) continue;
    await admin
      .from("asistencia_draft")
      .upsert(
        { id_jornada, id_usuario: equipo.id_capitan, id_equipo: equipo.id_equipo, presente: true },
        { onConflict: "id_jornada,id_usuario" }
      );
  }

  const primerEquipo = equipos[0];
  const { data: jornada, error: jornadaError } = await admin
    .from("jornadas")
    .update({ draft_estado: "en_curso", draft_turno_equipo_id: primerEquipo.id_equipo })
    .eq("id_jornada", id_jornada)
    .select("*")
    .single();

  if (jornadaError) {
    return NextResponse.json({ error: jornadaError.message }, { status: 500 });
  }
  return NextResponse.json({ jornada });
}

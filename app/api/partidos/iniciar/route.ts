import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/partidos/iniciar
// body: { id_partido: string, duracion_seg?: number }
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_partido, duracion_seg } = (await req.json()) as { id_partido?: string; duracion_seg?: number };
  if (!id_partido) return NextResponse.json({ error: "Falta id_partido" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: partidoExistente } = await admin
    .from("mini_partidos")
    .select("id_jornada, estado")
    .eq("id_partido", id_partido)
    .maybeSingle();
  if (!partidoExistente) return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
  const { data: jornada } = await admin
    .from("jornadas")
    .select("estado")
    .eq("id_jornada", partidoExistente.id_jornada)
    .maybeSingle();
  if (jornada?.estado !== "en_curso") {
    return NextResponse.json({ error: "La jornada debe estar en curso para iniciar un partido." }, { status: 400 });
  }
  if (partidoExistente.estado !== "pendiente") {
    return NextResponse.json({ error: "Este partido ya fue iniciado o finalizado." }, { status: 400 });
  }
  const patch: Record<string, unknown> = { estado: "en_curso", inicio_ts: new Date().toISOString() };
  if (duracion_seg && duracion_seg > 0) patch.duracion_seg = duracion_seg;

  const { data, error } = await admin
    .from("mini_partidos")
    .update(patch)
    .eq("id_partido", id_partido)
    .eq("estado", "pendiente")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "El partido cambió antes de poder iniciarse." }, { status: 409 });
  return NextResponse.json({ partido: data });
}

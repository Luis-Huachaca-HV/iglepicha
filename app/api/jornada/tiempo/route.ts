import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/jornada/tiempo
// body: { id_jornada: string, tiempo_total_seg?: number, duracion_mini_partido_seg?: number }
// tiempo_total_seg (el cronómetro del Dashboard) solo se puede cambiar
// antes de iniciar la jornada. duracion_mini_partido_seg (el valor por
// defecto para cada partido nuevo en la cola) se puede cambiar en
// cualquier momento — solo afecta a los partidos que todavía no arrancan.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, tiempo_total_seg, duracion_mini_partido_seg } = (await req.json()) as {
    id_jornada?: string;
    tiempo_total_seg?: number;
    duracion_mini_partido_seg?: number;
  };
  if (!id_jornada) return NextResponse.json({ error: "Falta id_jornada" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: jornada } = await admin.from("jornadas").select("estado").eq("id_jornada", id_jornada).single();
  if (!jornada) return NextResponse.json({ error: "Jornada no encontrada" }, { status: 404 });

  const patch: Record<string, number> = {};
  if (tiempo_total_seg !== undefined) {
    if (jornada.estado !== "pendiente") {
      return NextResponse.json({ error: "El tiempo global solo se puede cambiar antes de iniciar la jornada" }, { status: 400 });
    }
    patch.tiempo_total_seg = tiempo_total_seg;
  }
  if (duracion_mini_partido_seg !== undefined) {
    patch.duracion_mini_partido_seg = duracion_mini_partido_seg;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await admin.from("jornadas").update(patch).eq("id_jornada", id_jornada).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jornada: data });
}

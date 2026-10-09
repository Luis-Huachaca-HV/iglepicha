import { NextRequest, NextResponse } from "next/server";
import { ampliarCupoSiHaceFalta } from "@/lib/draft-asignar";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/draft/trade
// body: { id_jornada: string, id_usuario: string, id_equipo_destino: string | null }
// Mueve a un jugador de equipo. Solo admin/super_admin, con la jornada
// todavía pendiente y el draft ya cerrado. id_equipo_destino en null
// lo devuelve a la bolsa. No hay tope de cupo: si el destino se pasa,
// el cupo de ese equipo crece.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, id_usuario, id_equipo_destino } = (await req.json()) as {
    id_jornada?: string;
    id_usuario?: string;
    id_equipo_destino?: string | null;
  };
  if (!id_jornada || !id_usuario) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: jornada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).single();
  if (!jornada || jornada.estado !== "pendiente" || jornada.draft_estado !== "finalizado") {
    return NextResponse.json({ error: "Solo se pueden mover jugadores cuando el draft ya terminó y la jornada no empezó." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("asistencia_draft")
    .update({ id_equipo: id_equipo_destino ?? null })
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (id_equipo_destino) await ampliarCupoSiHaceFalta(admin, id_equipo_destino);
  return NextResponse.json({ asistencia: data });
}

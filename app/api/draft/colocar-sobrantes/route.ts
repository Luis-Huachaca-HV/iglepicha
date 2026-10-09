import { NextRequest, NextResponse } from "next/server";
import { colocarSobrantesEnJornada } from "@/lib/draft-asignar";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/draft/colocar-sobrantes
// body: { id_jornada: string }
// Mete en un equipo a quien sigue en la bolsa. Si los cupos están llenos,
// agranda uno al azar (N+1) en vez de dejar al jugador afuera.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada } = (await req.json()) as { id_jornada?: string };
  if (!id_jornada) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: jornada } = await admin.from("jornadas").select("estado").eq("id_jornada", id_jornada).maybeSingle();
  if (!jornada) return NextResponse.json({ error: "Jornada no encontrada" }, { status: 404 });
  if (jornada.estado !== "pendiente") {
    return NextResponse.json({ error: "Los equipos se bloquean al iniciar la jornada." }, { status: 400 });
  }

  const resultado = await colocarSobrantesEnJornada(admin, id_jornada);
  if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 500 });
  return NextResponse.json({ asignados: resultado.asignados });
}

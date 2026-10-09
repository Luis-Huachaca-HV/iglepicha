import { NextRequest, NextResponse } from "next/server";
import { recalcularEquiposJornada } from "@/lib/draft-asignar";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/draft/recalcular
// body: { id_jornada: string, cupos?: Record<id_equipo, number> }
// Reparte a todos los presentes equilibrando valoración. Si hay más
// gente que cupos, los sobrantes entran a equipos ya creados y ese
// cupo sube. Cierra el draft.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, cupos } = (await req.json()) as {
    id_jornada?: string;
    cupos?: Record<string, number>;
  };
  if (!id_jornada) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

  const admin = supabaseAdmin();
  const resultado = await recalcularEquiposJornada(admin, id_jornada, cupos);
  if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 400 });

  const { data: jornada, error } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jornada });
}

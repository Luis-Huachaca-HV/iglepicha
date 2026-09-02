import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// POST /api/partidos/iniciar
// body: { id_partido: string, duracion_seg?: number }
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_partido, duracion_seg } = (await req.json()) as { id_partido?: string; duracion_seg?: number };
  if (!id_partido) return NextResponse.json({ error: "Falta id_partido" }, { status: 400 });

  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = { estado: "en_curso", inicio_ts: new Date().toISOString() };
  if (duracion_seg && duracion_seg > 0) patch.duracion_seg = duracion_seg;

  const { data, error } = await admin.from("mini_partidos").update(patch).eq("id_partido", id_partido).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partido: data });
}

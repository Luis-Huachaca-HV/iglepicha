import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/partidos/reiniciar
// body: { id_partido: string }
// Vuelve un partido a "pendiente" con marcador 0-0 y borra su timeline,
// sin tocar la cola ni los equipos. Pensado para pruebas: "me equivoqué,
// quiero salir de este partido y arrancar de nuevo" sin tener que
// finalizarlo ni desarmar el draft.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_partido } = (await req.json()) as { id_partido?: string };
  if (!id_partido) return NextResponse.json({ error: "Falta id_partido" }, { status: 400 });

  const admin = supabaseAdmin();
  await admin.from("eventos_partido").delete().eq("id_partido", id_partido);
  const { data, error } = await admin
    .from("mini_partidos")
    .update({ estado: "pendiente", inicio_ts: null, marcador_a: 0, marcador_b: 0 })
    .eq("id_partido", id_partido)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partido: data });
}

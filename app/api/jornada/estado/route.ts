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
  const patch =
    accion === "iniciar"
      ? { estado: "en_curso" as const, inicio_ts: new Date().toISOString() }
      : { estado: "finalizada" as const };

  const { data, error } = await admin
    .from("jornadas")
    .update(patch)
    .eq("id_jornada", id_jornada)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ jornada: data });
}

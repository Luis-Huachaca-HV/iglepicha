import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// POST /api/draft/toggle-cambios
// body: { id_jornada: string, permitir: boolean }
// Admin activa/desactiva el "mercado de cambios" post-draft.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, permitir } = (await req.json()) as { id_jornada?: string; permitir?: boolean };
  if (!id_jornada || typeof permitir !== "boolean") {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("jornadas")
    .update({ permitir_cambios_post_draft: permitir })
    .eq("id_jornada", id_jornada)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jornada: data });
}

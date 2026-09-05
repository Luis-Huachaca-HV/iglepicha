import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

const POSICIONES = ["POR", "DEF", "MC", "DEL"];

// POST /api/usuarios/posicion
// body: { id_usuario: string, posicion: "POR"|"DEF"|"MC"|"DEL" }
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_usuario, posicion } = (await req.json()) as { id_usuario?: string; posicion?: string };
  if (!id_usuario || !posicion || !POSICIONES.includes(posicion)) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("usuarios").update({ posicion }).eq("id_usuario", id_usuario);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

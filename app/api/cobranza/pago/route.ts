import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/cobranza/pago
// body: { id_jornada: string, id_usuario: string, pago_realizado: boolean }
// Bloqueada mientras la jornada está "en_curso" (spec: Cobranza se
// congela durante el juego). Admin/super_admin/capitán pueden marcar a
// cualquiera; un jugador puede marcarse solo a sí mismo.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id_jornada, id_usuario, pago_realizado } = (await req.json()) as {
    id_jornada?: string;
    id_usuario?: string;
    pago_realizado?: boolean;
  };
  if (!id_jornada || !id_usuario || typeof pago_realizado !== "boolean") {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: jornada } = await admin.from("jornadas").select("estado").eq("id_jornada", id_jornada).single();
  if (jornada?.estado === "en_curso") {
    return NextResponse.json({ error: "La cobranza está bloqueada mientras la jornada está en curso" }, { status: 400 });
  }

  const puedeMarcarAOtros = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);
  if (!puedeMarcarAOtros && sesion.id_usuario !== id_usuario) {
    return NextResponse.json({ error: "Solo puedes marcar tu propio pago" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("asistencia_draft")
    .update({ pago_realizado })
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asistencia: data });
}

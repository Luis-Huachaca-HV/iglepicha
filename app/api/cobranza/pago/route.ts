import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/cobranza/pago
// body: { id_jornada: string, id_usuario: string, pago_realizado: boolean }
// Disponible solo tras finalizar la jornada. Admin/super_admin pueden
// marcar a cualquiera; cada capitán solo a jugadores de su propio equipo.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
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
  if (jornada?.estado !== "finalizada") {
    return NextResponse.json({ error: "La cobranza se habilita al finalizar la jornada." }, { status: 400 });
  }

  if (!["admin", "super_admin", "capitan"].includes(sesion.rol_sistema)) {
    return NextResponse.json({ error: "Solo el capitán o un admin pueden marcar el pago" }, { status: 403 });
  }

  const { data: actual } = await admin
    .from("asistencia_draft")
    .select("pago_realizado, id_equipo")
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario)
    .maybeSingle();
  if (!actual?.id_equipo) return NextResponse.json({ error: "El jugador no pertenece a un equipo de esta jornada." }, { status: 400 });
  if (sesion.rol_sistema === "capitan") {
    const { data: equipo } = await admin
      .from("equipos_jornada")
      .select("id_capitan")
      .eq("id_equipo", actual.id_equipo)
      .maybeSingle();
    if (equipo?.id_capitan !== sesion.id_usuario) {
      return NextResponse.json({ error: "Solo puedes marcar pagos de tu propio equipo." }, { status: 403 });
    }
  }
  if (actual?.pago_realizado && !pago_realizado) {
    return NextResponse.json({ error: "Ya estaba marcado como pagado — no se puede deshacer" }, { status: 400 });
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

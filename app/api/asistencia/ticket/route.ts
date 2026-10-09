import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/asistencia/ticket
// body: { id_jornada, id_usuario, ticket_adicional }
// Check verde, independiente de la asistencia. Cobranza lo suma después.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id_jornada, id_usuario, ticket_adicional } = (await req.json()) as {
    id_jornada?: string;
    id_usuario?: string;
    ticket_adicional?: boolean;
  };
  if (!id_jornada || !id_usuario || typeof ticket_adicional !== "boolean") {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const puedeMarcarAOtros = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);
  if (!puedeMarcarAOtros && sesion.id_usuario !== id_usuario) {
    return NextResponse.json({ error: "Solo puedes marcar tu propio ticket" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data: jornada } = await admin.from("jornadas").select("estado").eq("id_jornada", id_jornada).maybeSingle();
  if (!jornada) return NextResponse.json({ error: "Jornada no encontrada" }, { status: 404 });
  if (jornada.estado === "en_curso") {
    return NextResponse.json({ error: "El ticket se bloquea cuando la jornada ya está en curso." }, { status: 400 });
  }

  const { data: actual } = await admin
    .from("asistencia_draft")
    .select("id_asistencia")
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario)
    .maybeSingle();

  const consulta = actual
    ? admin
        .from("asistencia_draft")
        .update({ ticket_adicional })
        .eq("id_jornada", id_jornada)
        .eq("id_usuario", id_usuario)
        .select("*")
        .single()
    : admin
        .from("asistencia_draft")
        .insert({ id_jornada, id_usuario, ticket_adicional, presente: false })
        .select("*")
        .single();

  const { data, error } = await consulta;

  if (error) {
    if (error.message.includes("ticket_adicional")) {
      return NextResponse.json(
        { error: "Falta la columna ticket_adicional en Supabase. Corre supabase/migrations/012_ticket_adicional.sql." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ asistencia: data });
}

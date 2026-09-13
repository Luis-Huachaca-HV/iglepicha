import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/cobranza/entregado
// body: { id_equipo: string }
// Marca que el capitán ya le entregó el total de su equipo al admin.
// Solo admin/super_admin (son ellos quienes reciben la plata y confirman).
// Una sola vía: una vez marcado, no se puede desmarcar (evita reversos
// accidentales de un movimiento de dinero ya confirmado).
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_equipo } = (await req.json()) as { id_equipo?: string };
  if (!id_equipo) return NextResponse.json({ error: "Falta id_equipo" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: actual } = await admin.from("equipos_jornada").select("pago_entregado_admin").eq("id_equipo", id_equipo).single();
  if (!actual) return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  if (actual?.pago_entregado_admin) {
    return NextResponse.json({ error: "Ya estaba confirmado — no se puede deshacer" }, { status: 400 });
  }
  const { data: miembros } = await admin
    .from("asistencia_draft")
    .select("pago_realizado")
    .eq("id_equipo", id_equipo);
  if ((miembros ?? []).some((miembro) => !miembro.pago_realizado)) {
    return NextResponse.json({ error: "Primero registra el pago de todos los jugadores del equipo." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("equipos_jornada")
    .update({ pago_entregado_admin: true })
    .eq("id_equipo", id_equipo)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipo: data });
}

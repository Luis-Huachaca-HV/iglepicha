import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/jornada/nueva
// Crea una jornada nueva en blanco (pendiente, sin equipos ni asistencia).
// Solo admin/super_admin, y pensado para usarse cuando la jornada actual
// ya está "finalizada" y quieres arrancar la siguiente pichanga.
export async function POST() {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("jornadas")
    .insert({ estado: "pendiente", tiempo_total_seg: 7200, creado_por: `${sesion.nombre} (jornada nueva)` })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jornada: data });
}

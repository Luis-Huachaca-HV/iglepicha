import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/jornada/hard-reset
// Borra TODAS las jornadas (arrastra por cascada equipos, asistencia,
// partidos y eventos) y crea una jornada nueva en blanco. NUNCA toca la
// tabla usuarios. Botón de emergencia para cuando algo quedó atascado —
// hace lo mismo que correr reset-jornadas.sql a mano en Supabase, pero
// desde la app. Solo admin/super_admin.
export async function POST() {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { error: deleteError } = await admin.from("jornadas").delete().neq("id_jornada", "00000000-0000-0000-0000-000000000000");
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { data, error } = await admin
    .from("jornadas")
    .insert({ estado: "pendiente", tiempo_total_seg: 7200, creado_por: `${sesion.nombre} (reinicio total)` })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jornada: data });
}

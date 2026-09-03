import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// POST /api/cobranza/costo
// body: { id_jornada: string, costo_total: number }
// Guarda el costo total de la cancha y recalcula la cuota por equipo
// (costo_total / cantidad de equipos) para todos los equipos de la jornada.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, costo_total } = (await req.json()) as { id_jornada?: string; costo_total?: number };
  if (!id_jornada || costo_total === undefined || costo_total < 0) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: jornada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).single();
  if (!jornada) return NextResponse.json({ error: "Jornada no encontrada" }, { status: 404 });
  if (jornada.estado === "en_curso") {
    return NextResponse.json({ error: "La cobranza está bloqueada mientras la jornada está en curso" }, { status: 400 });
  }

  await admin.from("jornadas").update({ costo_total }).eq("id_jornada", id_jornada);

  const { data: equipos } = await admin.from("equipos_jornada").select("*").eq("id_jornada", id_jornada);
  const cantidadEquipos = equipos?.length || 0;
  const cuotaEquipo = cantidadEquipos > 0 ? costo_total / cantidadEquipos : 0;

  if (cantidadEquipos > 0) {
    await admin.from("equipos_jornada").update({ cuota_equipo: cuotaEquipo }).eq("id_jornada", id_jornada);
  }

  const { data: jornadaActualizada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).single();
  const { data: equiposActualizados } = await admin.from("equipos_jornada").select("*").eq("id_jornada", id_jornada);

  return NextResponse.json({ jornada: jornadaActualizada, equipos: equiposActualizados });
}

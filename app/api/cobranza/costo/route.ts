import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/cobranza/costo
// Todos los presentes (incluidos Camotes, Suplentes e Invitados) entran en la división de la cancha.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, costo_total, precio_ticket } = (await req.json()) as {
    id_jornada?: string;
    costo_total?: number;
    precio_ticket?: number;
  };
  if (!id_jornada || costo_total === undefined || costo_total < 0) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }
  const precioTicket = Number(precio_ticket) > 0 ? Number(precio_ticket) : 0;

  const admin = supabaseAdmin();

  const { data: jornada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).maybeSingle();
  if (!jornada) return NextResponse.json({ error: "Jornada no encontrada" }, { status: 404 });
  if (jornada.estado !== "finalizada") {
    return NextResponse.json({ error: "La cobranza se habilita al finalizar la jornada." }, { status: 400 });
  }

  await admin.from("jornadas").update({ costo_total }).eq("id_jornada", id_jornada);

  const { data: equipos } = await admin.from("equipos_jornada").select("*").eq("id_jornada", id_jornada);
  const conTicket = await admin
    .from("asistencia_draft")
    .select("id_usuario, id_equipo, presente, ticket_adicional")
    .eq("id_jornada", id_jornada);
  const sinTicket = conTicket.error
    ? await admin.from("asistencia_draft").select("id_usuario, id_equipo, presente").eq("id_jornada", id_jornada)
    : null;
  const filas: { id_usuario: string; id_equipo: string | null; presente: boolean; ticket_adicional?: boolean }[] =
    ((conTicket.error ? sinTicket?.data : conTicket.data) as {
      id_usuario: string;
      id_equipo: string | null;
      presente: boolean;
      ticket_adicional?: boolean;
    }[]) ?? [];

  const presentes = filas.filter((fila) => fila.presente);
  const cuotaPersona = presentes.length > 0 ? costo_total / presentes.length : 0;

  for (const equipo of equipos ?? []) {
    const roster = filas.filter((fila) => fila.id_equipo === equipo.id_equipo && fila.presente);
    const tickets = roster.filter((fila) => fila.ticket_adicional).length;
    const cuotaEquipo = roster.length * cuotaPersona + tickets * precioTicket;
    await admin.from("equipos_jornada").update({ cuota_equipo: cuotaEquipo }).eq("id_equipo", equipo.id_equipo);
  }

  const { data: jornadaActualizada } = await admin.from("jornadas").select("*").eq("id_jornada", id_jornada).maybeSingle();
  const { data: equiposActualizados } = await admin.from("equipos_jornada").select("*").eq("id_jornada", id_jornada);

  return NextResponse.json({ jornada: jornadaActualizada, equipos: equiposActualizados });
}

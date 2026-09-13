import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";
import { recalcularMarcador } from "@/lib/marcador";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// PATCH /api/partidos/evento/[id_evento]  body: { accion?, id_jugador? }
// DELETE /api/partidos/evento/[id_evento]
// Solo admin/super_admin pueden editar o borrar eventos ya cargados
// (para corregir un gol mal marcado, por ejemplo).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id_evento: string }> }) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_evento } = await params;
  const cambios = (await req.json()) as { accion?: "gol" | "falta"; id_jugador?: string };
  const admin = supabaseAdmin();

  const { data: eventoActual } = await admin.from("eventos_partido").select("*").eq("id_evento", id_evento).single();
  if (!eventoActual) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const { error } = await admin.from("eventos_partido").update(cambios).eq("id_evento", id_evento);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const partido = await recalcularMarcador(admin, eventoActual.id_partido);
  return NextResponse.json({ ok: true, partido });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id_evento: string }> }) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_evento } = await params;
  const admin = supabaseAdmin();
  const { data: eventoActual } = await admin.from("eventos_partido").select("*").eq("id_evento", id_evento).single();
  if (!eventoActual) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const { error } = await admin.from("eventos_partido").delete().eq("id_evento", id_evento);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const partido = await recalcularMarcador(admin, eventoActual.id_partido);
  return NextResponse.json({ ok: true, partido });
}

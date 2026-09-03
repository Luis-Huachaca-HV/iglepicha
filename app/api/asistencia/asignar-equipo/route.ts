import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/asistencia/asignar-equipo
// body: { id_jornada: string, id_usuario: string, id_equipo: string | null }
// Asigna (o quita, con id_equipo null) a un jugador de un equipo en
// cualquier momento — durante el draft, después de terminado, o incluso
// con un partido en curso. Pensado para "llegó tarde, súmalo a un equipo
// ya" sin pasar por el flujo de turnos del Draft.
// - admin/super_admin pueden asignar a cualquier equipo.
// - capitán solo puede asignar a SU PROPIO equipo (o quitar a alguien de él).
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || !["admin", "super_admin", "capitan"].includes(sesion.rol_sistema)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, id_usuario, id_equipo } = (await req.json()) as {
    id_jornada?: string;
    id_usuario?: string;
    id_equipo?: string | null;
  };
  if (!id_jornada || !id_usuario) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  if (sesion.rol_sistema === "capitan") {
    if (id_equipo) {
      const { data: equipoDestino } = await admin.from("equipos_jornada").select("id_capitan").eq("id_equipo", id_equipo).single();
      if (!equipoDestino || equipoDestino.id_capitan !== sesion.id_usuario) {
        return NextResponse.json({ error: "Solo puedes asignar jugadores a tu propio equipo" }, { status: 403 });
      }
    } else {
      const { data: actual } = await admin
        .from("asistencia_draft")
        .select("id_equipo")
        .eq("id_jornada", id_jornada)
        .eq("id_usuario", id_usuario)
        .maybeSingle();
      if (actual?.id_equipo) {
        const { data: equipoActual } = await admin.from("equipos_jornada").select("id_capitan").eq("id_equipo", actual.id_equipo).single();
        if (!equipoActual || equipoActual.id_capitan !== sesion.id_usuario) {
          return NextResponse.json({ error: "Solo puedes quitar jugadores de tu propio equipo" }, { status: 403 });
        }
      }
    }
  }

  const { data, error } = await admin
    .from("asistencia_draft")
    .upsert(
      { id_jornada, id_usuario, id_equipo: id_equipo ?? null, presente: true },
      { onConflict: "id_jornada,id_usuario" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asistencia: data });
}

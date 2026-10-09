import { NextRequest, NextResponse } from "next/server";
import { colocarSobrantesEnJornada } from "@/lib/draft-asignar";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/asistencia
// body: { id_jornada: string, id_usuario: string, presente: boolean }
// Marca asistencia. Cualquier usuario logueado puede marcarse a sí mismo;
// admin/super_admin/capitan pueden marcar a cualquiera (checklist en cancha).
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id_jornada, id_usuario, presente } = (await req.json()) as {
    id_jornada?: string;
    id_usuario?: string;
    presente?: boolean;
  };
  if (!id_jornada || !id_usuario || typeof presente !== "boolean") {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const puedeMarcarAOtros = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);
  if (!puedeMarcarAOtros && sesion.id_usuario !== id_usuario) {
    return NextResponse.json({ error: "Solo puedes marcar tu propia asistencia" }, { status: 403 });
  }

  const admin = supabaseAdmin();

  const { data: jornada } = await admin
    .from("jornadas")
    .select("estado, draft_estado")
    .eq("id_jornada", id_jornada)
    .single();
  if (jornada?.estado === "en_curso") {
    return NextResponse.json(
      { error: "La asistencia está bloqueada — la jornada ya está en curso." },
      { status: 400 }
    );
  }

  if (!presente) {
    const { data: actual } = await admin
      .from("asistencia_draft")
      .select("id_equipo")
      .eq("id_jornada", id_jornada)
      .eq("id_usuario", id_usuario)
      .maybeSingle();
    if (actual?.id_equipo) {
      return NextResponse.json(
        { error: "Ya está en un equipo del draft — no se puede quitar su asistencia hoy." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await admin
    .from("asistencia_draft")
    .upsert(
      { id_jornada, id_usuario, presente },
      { onConflict: "id_jornada,id_usuario" }
    )
    .select("*")
    .single();

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Esta jornada ya no existe (alguien la reinició) — recarga la pantalla para ver la actual.", jornadaInvalida: true },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Llegada tarde: si el draft ya armó equipos y los cupos base están
  // llenos, este jugador no se queda en la bolsa. Entra a un equipo y
  // ese cupo crece. Mientras el draft sigue y todavía hay hueco, queda
  // en la bolsa para que lo elija el capitán en turno.
  let advertencia: string | undefined;
  if (presente && jornada?.draft_estado && jornada.draft_estado !== "no_iniciado") {
    const colocados = await colocarSobrantesEnJornada(admin, id_jornada, {
      soloSiNoHayCupo: jornada.draft_estado === "en_curso",
    });
    if (colocados.error) {
      advertencia = "Quedó presente, pero no se pudo meterlo a un equipo. En Draft usa «Asignar sobrantes».";
    }
  }

  return NextResponse.json({ asistencia: data, advertencia });
}

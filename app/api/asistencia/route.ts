import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// POST /api/asistencia
// body: { id_jornada: string, id_usuario: string, presente: boolean }
// Marca asistencia. Cualquier usuario logueado puede marcarse a sí mismo;
// admin/super_admin/capitan pueden marcar a cualquiera (checklist en cancha).
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
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
  const { data, error } = await admin
    .from("asistencia_draft")
    .upsert(
      { id_jornada, id_usuario, presente },
      { onConflict: "id_jornada,id_usuario" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ asistencia: data });
}

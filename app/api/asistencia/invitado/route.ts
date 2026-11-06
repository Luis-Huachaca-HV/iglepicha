import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, id_usuario, es_invitado } = (await req.json()) as {
    id_jornada?: string;
    id_usuario?: string;
    es_invitado?: boolean;
  };
  if (!id_jornada || !id_usuario || typeof es_invitado !== "boolean") {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: existente } = await admin
    .from("asistencia_draft")
    .select("*")
    .eq("id_jornada", id_jornada)
    .eq("id_usuario", id_usuario)
    .maybeSingle();

  const { data, error } = await admin
    .from("asistencia_draft")
    .upsert(
      {
        id_jornada,
        id_usuario,
        presente: existente?.presente ?? false,
        es_invitado,
      },
      { onConflict: "id_jornada,id_usuario" }
    )
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `No se pudo guardar condición de invitado (verifica correr la migración SQL 014): ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ asistencia: data });
}

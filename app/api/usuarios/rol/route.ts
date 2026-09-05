import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";
import type { RolSistema } from "@/lib/types";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

const ROLES_VALIDOS: RolSistema[] = ["super_admin", "admin", "capitan", "jugador_registrado"];

// POST /api/usuarios/rol
// body: { id_usuario: string, rol_sistema: RolSistema }
// Cambia el rol de un usuario. Solo super_admin puede crear/ascender a
// otros super_admin o admin, para que un admin normal no pueda auto-
// otorgarse más permisos de los que ya tiene.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_usuario, rol_sistema } = (await req.json()) as { id_usuario?: string; rol_sistema?: RolSistema };
  if (!id_usuario || !rol_sistema || !ROLES_VALIDOS.includes(rol_sistema)) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }
  if ((rol_sistema === "admin" || rol_sistema === "super_admin") && sesion.rol_sistema !== "super_admin") {
    return NextResponse.json({ error: "Solo un super_admin puede asignar ese rol" }, { status: 403 });
  }

  const admin = supabaseAdmin();

  if (rol_sistema !== "capitan") {
    const { data: jornadaActiva } = await admin
      .from("jornadas")
      .select("id_jornada")
      .neq("estado", "finalizada")
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jornadaActiva) {
      const { data: equipoQueCapitanea } = await admin
        .from("equipos_jornada")
        .select("id_equipo")
        .eq("id_jornada", jornadaActiva.id_jornada)
        .eq("id_capitan", id_usuario)
        .maybeSingle();
      if (equipoQueCapitanea) {
        return NextResponse.json(
          { error: "Sigue capitaneando un equipo en la jornada actual — sácalo de ahí primero desde Jugadores/Draft." },
          { status: 400 }
        );
      }
    }
  }

  const { error } = await admin.from("usuarios").update({ rol_sistema }).eq("id_usuario", id_usuario);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

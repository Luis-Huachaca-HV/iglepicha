import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";
import type { RolSistema } from "@/lib/types";

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
  const { error } = await admin.from("usuarios").update({ rol_sistema }).eq("id_usuario", id_usuario);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

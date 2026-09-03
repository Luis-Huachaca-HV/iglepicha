import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";
import type { RolSistema } from "@/lib/types";

const ROLES_VALIDOS: RolSistema[] = ["super_admin", "admin", "capitan", "jugador_registrado"];

// POST /api/usuarios/crear
// body: { nombre: string, edad?: number, rol_sistema?: RolSistema }
// Crea un usuario nuevo. Sin PIN todavía (si el rol lo requiere, se
// crea la primera vez que esa persona inicia sesión — ver /api/auth/login).
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { nombre, edad, rol_sistema } = (await req.json()) as { nombre?: string; edad?: number; rol_sistema?: RolSistema };
  if (!nombre || !nombre.trim()) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  const rol = rol_sistema && ROLES_VALIDOS.includes(rol_sistema) ? rol_sistema : "jugador_registrado";

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("usuarios")
    .insert({ nombre: nombre.trim(), edad: edad || null, rol_sistema: rol })
    .select("id_usuario, nombre, edad, rol_sistema")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usuario: data });
}

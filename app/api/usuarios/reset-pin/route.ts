import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/usuarios/reset-pin
// body: { id_usuario: string }
// Borra el pin_hash de un usuario: la próxima vez que toque su nombre en
// el login, la app le va a pedir crear un PIN nuevo (mismo flujo que la
// primera vez). Soluciona el caso de "olvidé mi PIN" sin tocar Supabase.
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_usuario } = (await req.json()) as { id_usuario?: string };
  if (!id_usuario) return NextResponse.json({ error: "Falta id_usuario" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("usuarios").update({ pin_hash: null }).eq("id_usuario", id_usuario);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/equipos
// body: { id_jornada: string, capitanes: string[] }
// Crea un equipo por cada capitán elegido. La asignación de jugadores
// a cada equipo (el draft en sí) es la siguiente fase — acá solo se
// fija cuántos equipos hay y quién los capitanea.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, capitanes } = (await req.json()) as {
    id_jornada?: string;
    capitanes?: string[];
  };
  if (!id_jornada || !capitanes || capitanes.length < 2) {
    return NextResponse.json({ error: "Se necesitan al menos 2 capitanes" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Evita duplicar equipos si el admin repite la acción
  const { data: existentes } = await admin
    .from("equipos_jornada")
    .select("id_capitan")
    .eq("id_jornada", id_jornada);
  const yaCapitanes = new Set((existentes || []).map((e) => e.id_capitan));
  const nuevos = capitanes.filter((c) => !yaCapitanes.has(c)).map((id_capitan) => ({ id_jornada, id_capitan }));

  if (nuevos.length > 0) {
    const { error } = await admin.from("equipos_jornada").insert(nuevos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sube de rol a "capitan" a quien todavía era un jugador normal, para
  // que en su próximo login vea la pestaña Draft. Nunca degrada a un
  // admin/super_admin que haya sido elegido capitán.
  await admin
    .from("usuarios")
    .update({ rol_sistema: "capitan" })
    .in("id_usuario", capitanes)
    .eq("rol_sistema", "jugador_registrado");

  const { data: equipos } = await admin.from("equipos_jornada").select("*").eq("id_jornada", id_jornada);
  return NextResponse.json({ equipos });
}

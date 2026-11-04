import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_usuario, es_camote } = (await req.json()) as {
    id_usuario?: string;
    es_camote?: boolean;
  };
  if (!id_usuario || typeof es_camote !== "boolean") {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: usuario, error: errBusq } = await admin
    .from("usuarios")
    .select("id_usuario, edad")
    .eq("id_usuario", id_usuario)
    .maybeSingle();

  if (errBusq || !usuario) {
    return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
  }

  if (es_camote && (typeof usuario.edad !== "number" || usuario.edad >= 12)) {
    return NextResponse.json(
      { error: "Solo se puede marcar como Camote a jugadores menores de 12 años." },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("usuarios")
    .update({ es_camote })
    .eq("id_usuario", id_usuario)
    .select("id_usuario, nombre, edad, rol_sistema, posicion, es_camote")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `No se pudo guardar Camote (verifica haber corrido la migración SQL 013): ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ usuario: data });
}

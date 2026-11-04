import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

export const EDAD_MAX_CAMOTE = 12;

// POST /api/usuarios/camote
// body: { id_usuario: string, es_camote: boolean }
// Marca o desmarca a un jugador como Camote. Solo admin/super_admin.
// Solo se puede marcar a menores de 12 años (edad conocida y < 12).
// Desmarcar siempre está permitido.
// Requiere la migración 013 (columna usuarios.es_camote).
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
  const { data: usuario, error: errorUsuario } = await admin
    .from("usuarios")
    .select("id_usuario, edad")
    .eq("id_usuario", id_usuario)
    .maybeSingle();
  if (errorUsuario) return NextResponse.json({ error: errorUsuario.message }, { status: 500 });
  if (!usuario) return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });

  if (es_camote) {
    const edad = usuario.edad as number | null;
    if (edad == null || edad >= EDAD_MAX_CAMOTE) {
      return NextResponse.json(
        { error: "Solo se puede marcar Camote a menores de 12 años" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await admin
    .from("usuarios")
    .update({ es_camote })
    .eq("id_usuario", id_usuario)
    .select("id_usuario, nombre, edad, rol_sistema, posicion, es_camote")
    .single();
  if (error) {
    // 42703: la columna no existe todavía (falta correr la migración 013).
    if (error.code === "42703") {
      return NextResponse.json(
        { error: "La función Camote todavía no está habilitada en la base de datos (migración 013)." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ usuario: data });
}

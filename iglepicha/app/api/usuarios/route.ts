import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { esPinHashValido } from "@/lib/pin";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// GET /api/usuarios
// Lista pública para la pantalla de login: nunca devuelve pin_hash,
// solo si el usuario "tiene_pin" configurado (para saber si mostrar
// el flujo de "crear PIN" o "ingresar PIN").
//
// Migración 013: también devuelve `es_camote`. Se usa select("*") para
// que la ruta siga funcionando aunque la columna todavía no exista
// (en ese caso es_camote queda en false).
export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("usuarios")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuarios = (data || []).map((u) => ({
    id_usuario: u.id_usuario,
    nombre: u.nombre,
    edad: u.edad,
    rol_sistema: u.rol_sistema,
    posicion: u.posicion,
    tiene_pin: esPinHashValido(u.pin_hash),
    es_camote: u.es_camote === true,
  }));

  return NextResponse.json({ usuarios });
}

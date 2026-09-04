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
export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("usuarios")
    .select("id_usuario, nombre, edad, rol_sistema, pin_hash")
    .order("nombre", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuarios = (data || []).map((u) => ({
    id_usuario: u.id_usuario,
    nombre: u.nombre,
    edad: u.edad,
    rol_sistema: u.rol_sistema,
    tiene_pin: esPinHashValido(u.pin_hash),
  }));

  return NextResponse.json({ usuarios });
}

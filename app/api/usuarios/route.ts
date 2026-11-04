import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { esPinHashValido } from "@/lib/pin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("usuarios")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuarios = (data || []).map((u: Record<string, unknown>) => ({
    id_usuario: u.id_usuario,
    nombre: u.nombre,
    edad: u.edad,
    rol_sistema: u.rol_sistema,
    posicion: u.posicion,
    es_camote: Boolean(u.es_camote),
    tiene_pin: esPinHashValido(u.pin_hash as string | null),
  }));

  return NextResponse.json({ usuarios });
}

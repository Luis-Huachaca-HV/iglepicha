import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// GET /api/jornada/active
// Devuelve la jornada más reciente que no esté finalizada. Si no existe
// ninguna, crea una nueva en estado "pendiente" para que Dashboard y
// Jugadores tengan algo contra qué trabajar.
export async function GET() {
  const admin = supabaseAdmin();

  const { data: existente, error } = await admin
    .from("jornadas")
    .select("*")
    .neq("estado", "finalizada")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (existente) {
    return NextResponse.json({ jornada: existente });
  }

  const { data: nueva, error: insertError } = await admin
    .from("jornadas")
    .insert({ estado: "pendiente", tiempo_total_seg: 7200 })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ jornada: nueva });
}

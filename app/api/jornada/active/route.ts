import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// GET /api/jornada/active
// Devuelve la jornada más reciente, SEA CUAL SEA SU ESTADO (incluida una
// ya finalizada) — para que Cobranza, Draft, Partidos, etc. se queden
// mostrando esa jornada hasta que el admin decida explícitamente empezar
// una nueva (botón "Nueva jornada" en el Dashboard, ver /api/jornada/nueva).
// Solo se auto-crea una jornada si de verdad no existe NINGUNA todavía
// (primera vez que se usa la app).
export async function GET() {
  const admin = supabaseAdmin();

  const { data: existente, error } = await admin
    .from("jornadas")
    .select("*")
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

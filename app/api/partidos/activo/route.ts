import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// GET /api/partidos/activo?id_jornada=...
// Devuelve el partido pendiente o en curso más reciente de la jornada.
// La cola y el primer partido se crean al iniciar la jornada, nunca al
// visitar esta pantalla: mirar Partidos no debe cambiar el estado del juego.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id_jornada = searchParams.get("id_jornada");
  if (!id_jornada) return NextResponse.json({ error: "Falta id_jornada" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: jornada, error: jornadaError } = await admin
    .from("jornadas")
    .select("estado")
    .eq("id_jornada", id_jornada)
    .maybeSingle();
  if (jornadaError) return NextResponse.json({ error: jornadaError.message }, { status: 500 });
  if (!jornada) return NextResponse.json({ partido: null, error: "Jornada no encontrada" }, { status: 404 });
  if (jornada.estado === "pendiente") {
    return NextResponse.json({ partido: null, error: "Termina el draft e inicia la jornada para sortear el primer partido." });
  }
  if (jornada.estado === "finalizada") {
    return NextResponse.json({ partido: null, error: "La jornada ya finalizó." });
  }

  const { data: existente } = await admin
    .from("mini_partidos")
    .select("*")
    .eq("id_jornada", id_jornada)
    .neq("estado", "finalizado")
    .order("inicio_ts", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existente) {
    return NextResponse.json({ partido: existente });
  }

  const { count: partidosPrevios } = await admin
    .from("mini_partidos")
    .select("*", { count: "exact", head: true })
    .eq("id_jornada", id_jornada);

  if (partidosPrevios && partidosPrevios > 0) {
    // Ya hubo partidos antes: el siguiente SIEMPRE lo crea /api/partidos/finalizar
    // usando la cola real (quién ganó, quién sigue en la fila). Si todavía no
    // aparece, es que esa inserción está a mitad de camino (o el admin no ha
    // finalizado el partido anterior) — no inventamos un cruce acá, porque
    // eso era justamente el bug que repetía el mismo partido en bucle.
    return NextResponse.json({ partido: null, esperando: true });
  }

  return NextResponse.json({ partido: null, error: "El primer partido se está preparando." });
}

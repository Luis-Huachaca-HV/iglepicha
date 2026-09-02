import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/partidos/activo?id_jornada=...
// Devuelve el partido pendiente o en curso más reciente de la jornada.
// Si no existe ninguno todavía, inicializa la cola (orden_cola = orden_turno
// del Draft, la primera vez) y crea el primer partido con los dos equipos
// con menor orden_cola.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id_jornada = searchParams.get("id_jornada");
  if (!id_jornada) return NextResponse.json({ error: "Falta id_jornada" }, { status: 400 });

  const admin = supabaseAdmin();

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

  const { data: equipos } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_jornada", id_jornada)
    .order("orden_turno", { ascending: true });

  if (!equipos || equipos.length < 2) {
    return NextResponse.json({ partido: null, error: "Necesitas al menos 2 equipos (completa el Draft primero)" });
  }

  // Primera vez: no hay ningún partido creado aún para esta jornada.
  const { count: partidosPrevios } = await admin
    .from("mini_partidos")
    .select("*", { count: "exact", head: true })
    .eq("id_jornada", id_jornada);

  let listaEquipos = equipos;
  if (!partidosPrevios) {
    // Inicializa la cola con el orden del draft
    for (const e of equipos) {
      await admin.from("equipos_jornada").update({ orden_cola: e.orden_turno ?? 0 }).eq("id_equipo", e.id_equipo);
    }
    const { data: reconsultados } = await admin
      .from("equipos_jornada")
      .select("*")
      .eq("id_jornada", id_jornada)
      .order("orden_cola", { ascending: true });
    listaEquipos = reconsultados || equipos;
  }

  const [equipoA, equipoB] = listaEquipos;
  await admin.from("equipos_jornada").update({ orden_cola: null }).in("id_equipo", [equipoA.id_equipo, equipoB.id_equipo]);

  const { data: nuevoPartido, error } = await admin
    .from("mini_partidos")
    .insert({ id_jornada, id_equipo_a: equipoA.id_equipo, id_equipo_b: equipoB.id_equipo, estado: "pendiente" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partido: nuevoPartido });
}

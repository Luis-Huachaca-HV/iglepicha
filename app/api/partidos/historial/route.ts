import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET /api/partidos/historial
// Devuelve los últimos partidos finalizados de TODAS las jornadas (no solo
// la actual), con fecha/hora y nombres de equipo ya resueltos. Es lo único
// que se conserva como historial entre jornadas — equipos, draft y
// cobranza siempre arrancan de cero en cada jornada nueva.
export async function GET() {
  const admin = supabaseAdmin();

  const { data: partidos, error } = await admin
    .from("mini_partidos")
    .select("id_partido, id_jornada, id_equipo_a, id_equipo_b, marcador_a, marcador_b, inicio_ts")
    .eq("estado", "finalizado")
    .order("inicio_ts", { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!partidos || partidos.length === 0) return NextResponse.json({ historial: [] });

  const idsEquipo = Array.from(new Set(partidos.flatMap((p) => [p.id_equipo_a, p.id_equipo_b]).filter(Boolean)));
  const { data: equipos } = await admin.from("equipos_jornada").select("id_equipo, id_capitan").in("id_equipo", idsEquipo);
  const idsCapitan = Array.from(new Set((equipos || []).map((e) => e.id_capitan).filter(Boolean)));
  const { data: capitanes } = await admin.from("usuarios").select("id_usuario, nombre").in("id_usuario", idsCapitan);

  const nombreCapitan = Object.fromEntries((capitanes || []).map((c) => [c.id_usuario, c.nombre]));
  const nombreEquipo = Object.fromEntries(
    (equipos || []).map((e) => [e.id_equipo, `Equipo de ${nombreCapitan[e.id_capitan ?? ""] ?? "?"}`])
  );

  const historial = partidos.map((p) => ({
    id_partido: p.id_partido,
    fecha_hora: p.inicio_ts,
    equipo_a: nombreEquipo[p.id_equipo_a ?? ""] ?? "?",
    equipo_b: nombreEquipo[p.id_equipo_b ?? ""] ?? "?",
    marcador_a: p.marcador_a,
    marcador_b: p.marcador_b,
  }));

  return NextResponse.json({ historial });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/partidos/finalizar
// body: { id_partido: string, id_equipo_ganador?: string }
// Cierra el partido. Si hay empate, id_equipo_ganador es obligatorio
// (el admin decide manualmente quién sigue, según el spec). El equipo
// perdedor va al final de la cola; el próximo equipo en la cola entra
// a jugar contra el ganador ("el que gana se queda").
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_partido, id_equipo_ganador } = (await req.json()) as { id_partido?: string; id_equipo_ganador?: string };
  if (!id_partido) return NextResponse.json({ error: "Falta id_partido" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: partido } = await admin.from("mini_partidos").select("*").eq("id_partido", id_partido).single();
  if (!partido || !partido.id_equipo_a || !partido.id_equipo_b) {
    return NextResponse.json({ error: "Partido inválido" }, { status: 400 });
  }
  if (partido.estado !== "en_curso") {
    return NextResponse.json({ error: "Solo se puede finalizar un partido en curso." }, { status: 400 });
  }
  const { data: jornada } = await admin.from("jornadas").select("estado").eq("id_jornada", partido.id_jornada).maybeSingle();
  if (jornada?.estado !== "en_curso") {
    return NextResponse.json({ error: "La jornada ya no está en curso." }, { status: 400 });
  }

  let ganador: string;
  let perdedor: string;
  if (partido.marcador_a > partido.marcador_b) {
    ganador = partido.id_equipo_a;
    perdedor = partido.id_equipo_b;
  } else if (partido.marcador_b > partido.marcador_a) {
    ganador = partido.id_equipo_b;
    perdedor = partido.id_equipo_a;
  } else {
    if (!id_equipo_ganador) {
      return NextResponse.json({ error: "Empate: falta elegir manualmente quién continúa" }, { status: 400 });
    }
    if (id_equipo_ganador !== partido.id_equipo_a && id_equipo_ganador !== partido.id_equipo_b) {
      return NextResponse.json({ error: "El equipo elegido no participa en este partido." }, { status: 400 });
    }
    ganador = id_equipo_ganador;
    perdedor = ganador === partido.id_equipo_a ? partido.id_equipo_b : partido.id_equipo_a;
  }

  await admin.from("mini_partidos").update({ estado: "finalizado" }).eq("id_partido", id_partido);

  const { data: equipos } = await admin.from("equipos_jornada").select("*").eq("id_jornada", partido.id_jornada);
  const maxCola = Math.max(0, ...(equipos || []).map((e) => e.orden_cola ?? 0));
  await admin.from("equipos_jornada").update({ orden_cola: maxCola + 1 }).eq("id_equipo", perdedor);

  const { data: enEspera } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_jornada", partido.id_jornada)
    .not("orden_cola", "is", null)
    .order("orden_cola", { ascending: true })
    .limit(1)
    .maybeSingle();

  let siguientePartido = null;
  if (enEspera) {
    await admin.from("equipos_jornada").update({ orden_cola: null }).eq("id_equipo", enEspera.id_equipo);
    const { data: jornadaActual } = await admin
      .from("jornadas")
      .select("duracion_mini_partido_seg")
      .eq("id_jornada", partido.id_jornada)
      .single();
    const { data: nuevo } = await admin
      .from("mini_partidos")
      .insert({
        id_jornada: partido.id_jornada,
        id_equipo_a: ganador,
        id_equipo_b: enEspera.id_equipo,
        estado: "pendiente",
        duracion_seg: jornadaActual?.duracion_mini_partido_seg ?? 600,
      })
      .select("*")
      .single();
    siguientePartido = nuevo;
  }

  return NextResponse.json({ siguientePartido });
}

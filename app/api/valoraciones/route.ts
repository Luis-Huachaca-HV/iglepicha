import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

const ATRIBUTOS = ["velocidad", "resistencia", "ataque", "defensa", "pase_corto", "pase_largo", "regate", "juego_equipo", "agresividad"];

// POST /api/valoraciones
// body: { id_evaluado: string, stats: Record<string, number> }
// Admin/super_admin/capitán le ponen valoración a un jugador (1-10 por
// atributo). Se guarda como su propia evaluación (upsert); el promedio
// que ve el resto de la app sale de todas las evaluaciones que existan.
export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || !["admin", "super_admin", "capitan"].includes(sesion.rol_sistema)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_evaluado, stats } = (await req.json()) as { id_evaluado?: string; stats?: Record<string, number> };
  if (!id_evaluado || !stats) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  if (id_evaluado === sesion.id_usuario) return NextResponse.json({ error: "No puedes evaluarte a ti mismo" }, { status: 400 });

  const statsLimpio: Record<string, number> = {};
  for (const attr of ATRIBUTOS) {
    const valor = Number(stats[attr]);
    statsLimpio[attr] = Number.isFinite(valor) ? Math.min(10, Math.max(1, Math.round(valor))) : 5;
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("valoraciones")
    .upsert(
      { id_evaluado, id_evaluador: sesion.id_usuario, stats: statsLimpio },
      { onConflict: "id_evaluado,id_evaluador" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

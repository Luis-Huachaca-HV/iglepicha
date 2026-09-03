import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";
import { recalcularMarcador } from "@/lib/marcador";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/partidos/evento
// body: { id_partido: string, accion: "gol" | "falta", id_jugador: string }
export async function POST(req: NextRequest) {
  const sesion = obtenerSesionActual();
  if (!sesion || !["admin", "super_admin", "capitan"].includes(sesion.rol_sistema)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_partido, accion, id_jugador } = (await req.json()) as {
    id_partido?: string;
    accion?: "gol" | "falta";
    id_jugador?: string;
  };
  if (!id_partido || !accion || !id_jugador) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("eventos_partido").insert({ id_partido, accion, id_jugador });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const partido = accion === "gol" ? await recalcularMarcador(admin, id_partido) : null;
  return NextResponse.json({ ok: true, partido });
}

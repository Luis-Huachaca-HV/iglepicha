import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { obtenerSesionActual } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sesion = await obtenerSesionActual();
  if (!sesion || (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id_jornada, id_capitan, ids_suplentes } = (await req.json()) as {
    id_jornada?: string;
    id_capitan?: string;
    ids_suplentes?: string[];
  };

  if (!id_jornada || !id_capitan || !Array.isArray(ids_suplentes) || ids_suplentes.length < 5) {
    return NextResponse.json(
      { error: "Se requieren al menos 5 suplentes y elegir a su capitán para crear el 6to equipo." },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();
  const { data: equiposActuales, error: errEq } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_jornada", id_jornada)
    .order("orden_turno", { ascending: true });

  if (errEq) return NextResponse.json({ error: errEq.message }, { status: 500 });
  const ordenSiguiente = (equiposActuales ?? []).length;

  const { data: usuarioCap } = await admin
    .from("usuarios")
    .select("rol_sistema")
    .eq("id_usuario", id_capitan)
    .maybeSingle();

  if (usuarioCap && usuarioCap.rol_sistema === "jugador_registrado") {
    await admin.from("usuarios").update({ rol_sistema: "capitan" }).eq("id_usuario", id_capitan);
  }

  const cupo = ids_suplentes.length;
  const { data: nuevoEquipo, error: errInsert } = await admin
    .from("equipos_jornada")
    .insert({
      id_jornada,
      id_capitan,
      cupo_max: cupo,
      cupo_base: cupo,
      orden_turno: ordenSiguiente,
      orden_cola: ordenSiguiente,
    })
    .select("*")
    .maybeSingle();

  if (errInsert || !nuevoEquipo) {
    return NextResponse.json({ error: errInsert?.message ?? "No se pudo crear el 6to equipo" }, { status: 500 });
  }

  for (const idUsr of ids_suplentes) {
    await admin
      .from("asistencia_draft")
      .update({ id_equipo: nuevoEquipo.id_equipo, presente: true })
      .eq("id_jornada", id_jornada)
      .eq("id_usuario", idUsr);
  }

  return NextResponse.json({ equipo: nuevoEquipo });
}

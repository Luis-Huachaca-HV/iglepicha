import type { SupabaseClient } from "@supabase/supabase-js";
import {
  integrarSobrantes,
  repartirConCupoDinamico,
  type JugadorReparto,
  type PosicionReparto,
} from "@/lib/draft-capacidad";

type Admin = SupabaseClient;

type FilaEquipo = {
  id_equipo: string;
  id_capitan: string | null;
  cupo_max: number | null;
  cupo_base?: number | null;
  orden_turno: number | null;
};

type FilaAsistencia = {
  id_usuario: string;
  id_equipo: string | null;
  presente: boolean;
};

export type ResultadoColocacion = {
  asignados: { id_usuario: string; id_equipo: string }[];
  hayCupo: boolean;
  error?: string;
};

function cupoBaseDe(equipo: FilaEquipo): number | null {
  if (typeof equipo.cupo_base === "number") return equipo.cupo_base;
  return equipo.cupo_max;
}

/** La columna cupo_base llega con la migración 011. Si todavía no está, el reparto igual funciona. */
async function recordarCupoBase(admin: Admin, idEquipo: string, cupoBase: number) {
  await admin.from("equipos_jornada").update({ cupo_base: cupoBase }).eq("id_equipo", idEquipo);
}

async function leerEquipos(admin: Admin, idJornada: string): Promise<{ equipos: FilaEquipo[]; error?: string }> {
  const { data, error } = await admin
    .from("equipos_jornada")
    .select("*")
    .eq("id_jornada", idJornada)
    .order("orden_turno", { ascending: true });
  if (error) return { equipos: [], error: error.message };
  return { equipos: (data ?? []) as FilaEquipo[] };
}

async function leerAsistencias(admin: Admin, idJornada: string): Promise<{ filas: FilaAsistencia[]; error?: string }> {
  const { data, error } = await admin
    .from("asistencia_draft")
    .select("id_usuario, id_equipo, presente")
    .eq("id_jornada", idJornada);
  if (error) return { filas: [], error: error.message };
  return { filas: (data ?? []) as FilaAsistencia[] };
}

/**
 * Si un equipo quedó con más jugadores que su cupo guardado, sube cupo_max.
 * No rechaza la fila: en la base no hay un check de capacidad.
 */
export async function ampliarCupoSiHaceFalta(admin: Admin, idEquipo: string) {
  const [{ count }, { data: equipo }] = await Promise.all([
    admin.from("asistencia_draft").select("*", { count: "exact", head: true }).eq("id_equipo", idEquipo),
    admin.from("equipos_jornada").select("*").eq("id_equipo", idEquipo).maybeSingle(),
  ]);
  if (!equipo) return;
  const fila = equipo as FilaEquipo;
  const ocupados = count ?? 0;
  const cupoActual = fila.cupo_max ?? 0;
  if (fila.cupo_max == null || ocupados <= cupoActual) return;

  const { error } = await admin.from("equipos_jornada").update({ cupo_max: ocupados }).eq("id_equipo", idEquipo);
  if (error) return;
  if (typeof fila.cupo_base !== "number") {
    await recordarCupoBase(admin, idEquipo, cupoActual);
  }
}

/**
 * Asigna a los presentes que siguen sin equipo.
 * `soloSiNoHayCupo`: durante el draft en curso no les quita el turno a los
 * capitanes si todavía hay un hueco. Cuando todos los cupos base están
 * llenos, los mete igual.
 */
export async function colocarSobrantesEnJornada(
  admin: Admin,
  idJornada: string,
  opciones?: { soloSiNoHayCupo?: boolean }
): Promise<ResultadoColocacion> {
  const { equipos, error: errorEquipos } = await leerEquipos(admin, idJornada);
  if (errorEquipos) return { asignados: [], hayCupo: false, error: errorEquipos };
  if (equipos.length === 0) return { asignados: [], hayCupo: false };

  const { filas, error: errorAsistencias } = await leerAsistencias(admin, idJornada);
  if (errorAsistencias) return { asignados: [], hayCupo: false, error: errorAsistencias };

  const ocupados = new Map<string, number>();
  for (const equipo of equipos) ocupados.set(equipo.id_equipo, 0);
  const sobrantes: string[] = [];
  for (const fila of filas) {
    if (!fila.presente) continue;
    if (fila.id_equipo && ocupados.has(fila.id_equipo)) {
      ocupados.set(fila.id_equipo, (ocupados.get(fila.id_equipo) ?? 0) + 1);
    } else if (!fila.id_equipo) {
      sobrantes.push(fila.id_usuario);
    }
  }

  const hayCupo = equipos.some((equipo) => {
    const cupo = equipo.cupo_max;
    if (cupo == null) return true;
    return (ocupados.get(equipo.id_equipo) ?? 0) < cupo;
  });

  if (sobrantes.length === 0) return { asignados: [], hayCupo };
  if (opciones?.soloSiNoHayCupo && hayCupo) return { asignados: [], hayCupo: true };

  const { estado, asignaciones } = integrarSobrantes(
    equipos.map((equipo) => ({
      id: equipo.id_equipo,
      cupoBase: equipo.cupo_max,
      ocupados: ocupados.get(equipo.id_equipo) ?? 0,
    })),
    sobrantes
  );

  if (asignaciones.length < sobrantes.length) {
    return { asignados: [], hayCupo: false, error: "No se pudo asignar a todos los jugadores sin equipo" };
  }

  for (const asignacion of asignaciones) {
    const { error } = await admin
      .from("asistencia_draft")
      .update({ id_equipo: asignacion.idEquipo })
      .eq("id_jornada", idJornada)
      .eq("id_usuario", asignacion.idJugador);
    if (error) return { asignados: [], hayCupo: false, error: error.message };
  }

  for (const equipo of estado) {
    const original = equipos.find((item) => item.id_equipo === equipo.id);
    if (!original || equipo.cupo == null) continue;
    if (original.cupo_max != null && equipo.cupo <= original.cupo_max) continue;
    const { error } = await admin.from("equipos_jornada").update({ cupo_max: equipo.cupo }).eq("id_equipo", equipo.id);
    if (error) return { asignados: [], hayCupo: false, error: error.message };
    if (typeof original.cupo_base !== "number" && original.cupo_max != null) {
      await recordarCupoBase(admin, equipo.id, original.cupo_max);
    }
  }

  return {
    asignados: asignaciones.map((asignacion) => ({
      id_usuario: asignacion.idJugador,
      id_equipo: asignacion.idEquipo,
    })),
    hayCupo: false,
  };
}

async function siguienteEquipoConCupo(
  admin: Admin,
  idJornada: string,
  equipos: FilaEquipo[],
  idEquipoActual: string
): Promise<string | null> {
  const { filas } = await leerAsistencias(admin, idJornada);
  const ocupados = new Map<string, number>();
  let enBolsa = 0;
  for (const fila of filas) {
    if (!fila.presente) continue;
    if (fila.id_equipo) ocupados.set(fila.id_equipo, (ocupados.get(fila.id_equipo) ?? 0) + 1);
    else enBolsa += 1;
  }
  if (enBolsa === 0) return null;

  const idxActual = equipos.findIndex((equipo) => equipo.id_equipo === idEquipoActual);
  for (let paso = 1; paso <= equipos.length; paso++) {
    const candidato = equipos[(idxActual + paso) % equipos.length];
    if (!candidato) continue;
    const cupo = candidato.cupo_max;
    const usados = ocupados.get(candidato.id_equipo) ?? 0;
    if (cupo == null || usados < cupo) return candidato.id_equipo;
  }
  return null;
}

/**
 * Después de un pick: si queda gente en la bolsa y algún equipo tiene
 * cupo, sigue el turno. Si los cupos base ya se llenaron, asigna a los
 * sobrantes y cierra el draft — no los deja en la bolsa.
 */
export async function cerrarOContinuarDraft(
  admin: Admin,
  idJornada: string,
  idEquipoActual: string
): Promise<{ siguienteEquipo: string | null; error?: string }> {
  const { equipos, error } = await leerEquipos(admin, idJornada);
  if (error) return { siguienteEquipo: null, error };
  if (equipos.length === 0) return { siguienteEquipo: null };

  const siguiente = await siguienteEquipoConCupo(admin, idJornada, equipos, idEquipoActual);
  if (siguiente) return { siguienteEquipo: siguiente };

  const { filas } = await leerAsistencias(admin, idJornada);
  const haySobrantes = filas.some((fila) => fila.presente && !fila.id_equipo);
  if (!haySobrantes) return { siguienteEquipo: null };

  const colocados = await colocarSobrantesEnJornada(admin, idJornada, { soloSiNoHayCupo: true });
  if (colocados.error) return { siguienteEquipo: null, error: colocados.error };
  if (colocados.hayCupo) {
    const deNuevo = await siguienteEquipoConCupo(admin, idJornada, equipos, idEquipoActual);
    return { siguienteEquipo: deNuevo };
  }
  return { siguienteEquipo: null };
}

function promedioValoracion(stats: Record<string, number> | undefined): number | null {
  if (!stats) return null;
  const valores = Object.values(stats);
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

async function valoracionesGenerales(admin: Admin): Promise<Record<string, number>> {
  const { data } = await admin.from("valoraciones").select("id_evaluado, stats");
  const acumulado: Record<string, { suma: Record<string, number>; n: number }> = {};
  for (const fila of data ?? []) {
    const entry = (acumulado[fila.id_evaluado] ??= { suma: {}, n: 0 });
    entry.n += 1;
    for (const [clave, valor] of Object.entries(fila.stats as Record<string, number>)) {
      entry.suma[clave] = (entry.suma[clave] ?? 0) + valor;
    }
  }
  const generales: Record<string, number> = {};
  for (const [id, { suma, n }] of Object.entries(acumulado)) {
    const promedios = Object.fromEntries(Object.entries(suma).map(([clave, valor]) => [clave, valor / n]));
    const general = promedioValoracion(promedios);
    if (general != null) generales[id] = general;
  }
  return generales;
}

export async function fijarCupos(
  admin: Admin,
  equipos: FilaEquipo[],
  cupos: Record<string, number>
): Promise<{ error?: string }> {
  for (let i = 0; i < equipos.length; i++) {
    const equipo = equipos[i]!;
    const cupo = cupos[equipo.id_equipo];
    if (!cupo || cupo < 1) return { error: "Falta cupo para un equipo" };
    const { error } = await admin
      .from("equipos_jornada")
      .update({ cupo_max: cupo, orden_turno: i })
      .eq("id_equipo", equipo.id_equipo);
    if (error) return { error: error.message };
    await recordarCupoBase(admin, equipo.id_equipo, cupo);
    equipo.cupo_max = cupo;
    equipo.cupo_base = cupo;
  }
  return {};
}

/**
 * Sorteo completo: equilibra por valoración y mete a todos los presentes,
 * aunque superen el cupo base. Cierra el draft.
 */
export async function recalcularEquiposJornada(
  admin: Admin,
  idJornada: string,
  cupos?: Record<string, number>
): Promise<{ error?: string }> {
  const { data: jornada, error: errorJornada } = await admin
    .from("jornadas")
    .select("estado")
    .eq("id_jornada", idJornada)
    .maybeSingle();
  if (errorJornada) return { error: errorJornada.message };
  if (!jornada) return { error: "Jornada no encontrada" };
  if (jornada.estado !== "pendiente") {
    return { error: "Los equipos se bloquean al iniciar la jornada." };
  }

  const { equipos, error: errorEquipos } = await leerEquipos(admin, idJornada);
  if (errorEquipos) return { error: errorEquipos };
  if (equipos.length < 2) return { error: "Se necesitan al menos 2 equipos" };

  if (cupos) {
    const fijados = await fijarCupos(admin, equipos, cupos);
    if (fijados.error) return fijados;
  }

  if (equipos.some((equipo) => cupoBaseDe(equipo) == null || (cupoBaseDe(equipo) ?? 0) < 1)) {
    return { error: "Define el cupo de cada equipo" };
  }

  const { error: errorAusentes } = await admin
    .from("asistencia_draft")
    .update({ id_equipo: null })
    .eq("id_jornada", idJornada)
    .eq("presente", false);
  if (errorAusentes) return { error: errorAusentes.message };

  const { filas, error: errorAsistencias } = await leerAsistencias(admin, idJornada);
  if (errorAsistencias) return { error: errorAsistencias };

  const presentes = new Set(filas.filter((fila) => fila.presente).map((fila) => fila.id_usuario));
  for (const equipo of equipos) {
    if (equipo.id_capitan) presentes.add(equipo.id_capitan);
  }
  if (presentes.size === 0) return { error: "No hay jugadores presentes para sortear" };

  const { data: usuarios, error: errorUsuarios } = await admin
    .from("usuarios")
    .select("id_usuario, posicion")
    .in("id_usuario", [...presentes]);
  if (errorUsuarios) return { error: errorUsuarios.message };

  const posicionPorId = new Map(
    (usuarios ?? []).map((usuario) => [usuario.id_usuario as string, (usuario.posicion ?? null) as PosicionReparto])
  );
  const ratings = await valoracionesGenerales(admin);
  const conocidos = Object.values(ratings).filter((valor) => valor > 0);
  const media = conocidos.length > 0 ? conocidos.reduce((a, b) => a + b, 0) / conocidos.length : 5;

  const jugadores: JugadorReparto[] = [...presentes].map((id) => ({
    id,
    valoracion: ratings[id] && ratings[id] > 0 ? ratings[id] : media,
    posicion: posicionPorId.get(id) ?? null,
  }));

  const plan = repartirConCupoDinamico(
    jugadores,
    equipos.map((equipo) => ({
      id: equipo.id_equipo,
      cupoBase: cupoBaseDe(equipo) ?? 1,
      fijos: equipo.id_capitan && presentes.has(equipo.id_capitan) ? [equipo.id_capitan] : [],
    }))
  );

  const asignados = new Set(plan.flatMap((equipo) => equipo.jugadores));
  if ([...presentes].some((id) => !asignados.has(id))) {
    return { error: "El sorteo dejó jugadores sin equipo" };
  }

  for (const equipo of plan) {
    for (const idUsuario of equipo.jugadores) {
      const { error } = await admin.from("asistencia_draft").upsert(
        { id_jornada: idJornada, id_usuario: idUsuario, id_equipo: equipo.id, presente: true },
        { onConflict: "id_jornada,id_usuario" }
      );
      if (error) return { error: error.message };
    }
    const { error: errorCupo } = await admin
      .from("equipos_jornada")
      .update({ cupo_max: equipo.cupoEfectivo })
      .eq("id_equipo", equipo.id);
    if (errorCupo) return { error: errorCupo.message };
    await recordarCupoBase(admin, equipo.id, equipo.cupoBase);
  }

  const { error: errorCierre } = await admin
    .from("jornadas")
    .update({ draft_estado: "finalizado", draft_turno_equipo_id: null })
    .eq("id_jornada", idJornada);
  if (errorCierre) return { error: errorCierre.message };

  return {};
}

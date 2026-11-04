import type { SupabaseClient } from "@supabase/supabase-js";

// Reglas adicionales del draft (migración 013):
//
// 1) Tope de jugadores "top" por equipo. Un jugador es top cuando el
//    promedio de sus 9 atributos (promediando a todos los evaluadores)
//    es >= jornadas.umbral_top (7.5 por defecto). El tope por equipo es
//    jornadas.max_tops_por_equipo o, si está en NULL, el automático:
//    ceil(tops presentes / cantidad de equipos), mínimo 1.
//    Ejemplos: 5 tops y 5 equipos → 1; 7 tops y 5 equipos → 2;
//    3 tops y 5 equipos → 1.
//    Aplica al pick del draft (/api/draft/elegir) y a los intercambios
//    post-draft (/api/draft/trade).
//
// 2) "Camote": menor de 12 años con usuarios.es_camote = true. Marca
//    asistencia pero NO entra a la bolsa del draft ni cuenta en el cupo.
//    Al cerrar el draft se reparte con colocarCamotes(): primero al
//    equipo con menos titulares; en empate, al de mayor valoración
//    promedio; máximo un Camote por equipo. Si hay más Camotes que
//    equipos, el sobrante queda sin equipo y se devuelve en `sinEquipo`
//    para avisar al admin. Tampoco entra en la cobranza.

type Admin = SupabaseClient;

export const UMBRAL_TOP_POR_DEFECTO = 7.5;

type FilaUsuario = {
  id_usuario: string;
  edad?: number | null;
  es_camote?: boolean | null;
};

type FilaAsistencia = {
  id_usuario: string;
  id_equipo: string | null;
  presente: boolean;
};

type FilaEquipo = {
  id_equipo: string;
  orden_turno: number | null;
};

export type ReglasDraft = {
  umbralTop: number;
  /** Tope vigente de tops por equipo (manual o automático). */
  maxTopsPorEquipo: number;
  /** true cuando el tope salió de jornadas.max_tops_por_equipo. */
  topeManual: boolean;
  /** Cantidad de tops presentes (sin contar Camotes). */
  totalTops: number;
  /** Promedio general por id_usuario (solo quienes tienen valoración). */
  promedios: Record<string, number>;
  topIds: Set<string>;
  camoteIds: Set<string>;
  /** Tops ya asignados a cada equipo. */
  topsPorEquipo: Map<string, number>;
  /** Titulares (no Camotes) asignados a cada equipo. */
  titularesPorEquipo: Map<string, number>;
  /** Camotes asignados a cada equipo. */
  camotesPorEquipo: Map<string, number>;
  equipos: FilaEquipo[];
  asistencias: FilaAsistencia[];
};

export function esCamote(usuario: FilaUsuario | null | undefined): boolean {
  if (!usuario) return false;
  if (usuario.es_camote !== true) return false;
  return typeof usuario.edad === "number" && usuario.edad < 12;
}

export function esTop(promedio: number | null | undefined, umbral: number): boolean {
  return typeof promedio === "number" && promedio >= umbral;
}

/** Tope automático: reparte los tops lo más parejo posible entre los equipos. */
export function topeAutomatico(totalTops: number, cantidadEquipos: number): number {
  if (cantidadEquipos <= 0) return 1;
  return Math.max(1, Math.ceil(totalTops / cantidadEquipos));
}

/** Promedio de los 9 atributos por jugador, promediando a todos los evaluadores. */
export async function promediosGenerales(admin: Admin): Promise<Record<string, number>> {
  const { data } = await admin.from("valoraciones").select("id_evaluado, stats");
  const acumulado: Record<string, { suma: Record<string, number>; n: number }> = {};
  for (const fila of data ?? []) {
    const stats = (fila.stats ?? {}) as Record<string, unknown>;
    const entry = (acumulado[fila.id_evaluado as string] ??= { suma: {}, n: 0 });
    entry.n += 1;
    for (const [clave, valor] of Object.entries(stats)) {
      if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
      entry.suma[clave] = (entry.suma[clave] ?? 0) + valor;
    }
  }
  const generales: Record<string, number> = {};
  for (const [id, { suma, n }] of Object.entries(acumulado)) {
    const valores = Object.values(suma).map((total) => total / n);
    if (valores.length === 0) continue;
    generales[id] = valores.reduce((a, b) => a + b, 0) / valores.length;
  }
  return generales;
}

/** Lee todo lo necesario para evaluar las reglas de una jornada. */
export async function leerReglasDraft(admin: Admin, idJornada: string): Promise<{ reglas?: ReglasDraft; error?: string }> {
  const [{ data: jornada, error: errorJornada }, { data: equiposData, error: errorEquipos }, { data: asistenciaData, error: errorAsistencia }] =
    await Promise.all([
      admin.from("jornadas").select("*").eq("id_jornada", idJornada).maybeSingle(),
      admin.from("equipos_jornada").select("id_equipo, orden_turno").eq("id_jornada", idJornada).order("orden_turno", { ascending: true }),
      admin.from("asistencia_draft").select("id_usuario, id_equipo, presente").eq("id_jornada", idJornada),
    ]);
  if (errorJornada) return { error: errorJornada.message };
  if (!jornada) return { error: "Jornada no encontrada" };
  if (errorEquipos) return { error: errorEquipos.message };
  if (errorAsistencia) return { error: errorAsistencia.message };

  const equipos = (equiposData ?? []) as FilaEquipo[];
  const asistencias = ((asistenciaData ?? []) as FilaAsistencia[]).filter((fila) => fila.presente);
  const idsPresentes = asistencias.map((fila) => fila.id_usuario);

  const camoteIds = new Set<string>();
  if (idsPresentes.length > 0) {
    // select("*") y no columnas explícitas: si la migración 013 aún no
    // corrió, es_camote no existe y la consulta no debe romper el draft.
    const { data: usuarios, error: errorUsuarios } = await admin.from("usuarios").select("*").in("id_usuario", idsPresentes);
    if (errorUsuarios) return { error: errorUsuarios.message };
    for (const usuario of (usuarios ?? []) as FilaUsuario[]) {
      if (esCamote(usuario)) camoteIds.add(usuario.id_usuario);
    }
  }

  const promedios = await promediosGenerales(admin);
  const umbralCrudo = (jornada as { umbral_top?: number | string | null }).umbral_top;
  const umbralTop = umbralCrudo == null || Number.isNaN(Number(umbralCrudo)) ? UMBRAL_TOP_POR_DEFECTO : Number(umbralCrudo);

  const topIds = new Set<string>();
  for (const fila of asistencias) {
    if (camoteIds.has(fila.id_usuario)) continue;
    if (esTop(promedios[fila.id_usuario], umbralTop)) topIds.add(fila.id_usuario);
  }

  const topeCrudo = (jornada as { max_tops_por_equipo?: number | null }).max_tops_por_equipo;
  const topeManual = typeof topeCrudo === "number" && topeCrudo >= 1;
  const maxTopsPorEquipo = topeManual ? topeCrudo : topeAutomatico(topIds.size, equipos.length);

  const topsPorEquipo = new Map<string, number>();
  const titularesPorEquipo = new Map<string, number>();
  const camotesPorEquipo = new Map<string, number>();
  for (const equipo of equipos) {
    topsPorEquipo.set(equipo.id_equipo, 0);
    titularesPorEquipo.set(equipo.id_equipo, 0);
    camotesPorEquipo.set(equipo.id_equipo, 0);
  }
  for (const fila of asistencias) {
    if (!fila.id_equipo || !topsPorEquipo.has(fila.id_equipo)) continue;
    if (camoteIds.has(fila.id_usuario)) {
      camotesPorEquipo.set(fila.id_equipo, (camotesPorEquipo.get(fila.id_equipo) ?? 0) + 1);
      continue;
    }
    titularesPorEquipo.set(fila.id_equipo, (titularesPorEquipo.get(fila.id_equipo) ?? 0) + 1);
    if (topIds.has(fila.id_usuario)) {
      topsPorEquipo.set(fila.id_equipo, (topsPorEquipo.get(fila.id_equipo) ?? 0) + 1);
    }
  }

  return {
    reglas: {
      umbralTop,
      maxTopsPorEquipo,
      topeManual,
      totalTops: topIds.size,
      promedios,
      topIds,
      camoteIds,
      topsPorEquipo,
      titularesPorEquipo,
      camotesPorEquipo,
      equipos,
      asistencias,
    },
  };
}

/**
 * Motivo por el que un equipo NO puede recibir a un jugador, o null si
 * puede. Sirve tanto para el pick del draft como para un intercambio.
 * `ignorarActual`: en un trade el jugador puede venir de otro equipo; si
 * ya está en el destino no se cuenta dos veces.
 */
export function motivoBloqueo(reglas: ReglasDraft, idEquipoDestino: string, idUsuario: string): string | null {
  if (reglas.camoteIds.has(idUsuario)) {
    return "Este jugador es Camote: no entra al draft, se reparte automáticamente al cerrar.";
  }
  if (!reglas.topIds.has(idUsuario)) return null;

  const yaEnDestino = reglas.asistencias.some((fila) => fila.id_usuario === idUsuario && fila.id_equipo === idEquipoDestino);
  if (yaEnDestino) return null;

  const topsActuales = reglas.topsPorEquipo.get(idEquipoDestino) ?? 0;
  if (topsActuales >= reglas.maxTopsPorEquipo) {
    const tope = reglas.maxTopsPorEquipo;
    return `Este equipo ya tiene ${topsActuales} jugador${topsActuales === 1 ? "" : "es"} top (máximo ${tope} por equipo, promedio ≥ ${reglas.umbralTop}).`;
  }
  return null;
}

export type ResultadoCamotes = {
  asignados: { id_usuario: string; id_equipo: string }[];
  /** Camotes que quedaron sin equipo (más Camotes que equipos). */
  sinEquipo: string[];
  error?: string;
};

/**
 * Reparte a los Camotes presentes que siguen sin equipo.
 * Orden de preferencia: menos titulares → mayor valoración promedio de
 * sus titulares → orden de turno. Máximo un Camote por equipo.
 */
export async function colocarCamotes(admin: Admin, idJornada: string): Promise<ResultadoCamotes> {
  const { reglas, error } = await leerReglasDraft(admin, idJornada);
  if (error || !reglas) return { asignados: [], sinEquipo: [], error: error ?? "Sin datos de la jornada" };
  if (reglas.equipos.length === 0) return { asignados: [], sinEquipo: [] };

  const pendientes = reglas.asistencias
    .filter((fila) => reglas.camoteIds.has(fila.id_usuario) && !fila.id_equipo)
    .map((fila) => fila.id_usuario);
  if (pendientes.length === 0) return { asignados: [], sinEquipo: [] };

  const promedioEquipo = (idEquipo: string): number => {
    const titulares = reglas.asistencias.filter(
      (fila) => fila.id_equipo === idEquipo && !reglas.camoteIds.has(fila.id_usuario) && typeof reglas.promedios[fila.id_usuario] === "number"
    );
    if (titulares.length === 0) return 0;
    return titulares.reduce((suma, fila) => suma + (reglas.promedios[fila.id_usuario] ?? 0), 0) / titulares.length;
  };

  const candidatos = reglas.equipos
    .filter((equipo) => (reglas.camotesPorEquipo.get(equipo.id_equipo) ?? 0) === 0)
    .map((equipo) => ({
      id: equipo.id_equipo,
      titulares: reglas.titularesPorEquipo.get(equipo.id_equipo) ?? 0,
      promedio: promedioEquipo(equipo.id_equipo),
      orden: equipo.orden_turno ?? 0,
    }))
    .sort((a, b) => a.titulares - b.titulares || b.promedio - a.promedio || a.orden - b.orden);

  const asignados: { id_usuario: string; id_equipo: string }[] = [];
  const sinEquipo: string[] = [];
  // Orden aleatorio entre los Camotes para no favorecer siempre al mismo.
  const cola = [...pendientes].sort(() => Math.random() - 0.5);

  for (const idUsuario of cola) {
    const destino = candidatos.shift();
    if (!destino) {
      sinEquipo.push(idUsuario);
      continue;
    }
    const { error: errorUpdate } = await admin
      .from("asistencia_draft")
      .update({ id_equipo: destino.id })
      .eq("id_jornada", idJornada)
      .eq("id_usuario", idUsuario);
    if (errorUpdate) return { asignados, sinEquipo, error: errorUpdate.message };
    asignados.push({ id_usuario: idUsuario, id_equipo: destino.id });
  }

  return { asignados, sinEquipo };
}

/** Ids de los Camotes presentes en la jornada (para excluirlos de bolsa, cupo y cobranza). */
export async function camotesPresentes(admin: Admin, idJornada: string): Promise<Set<string>> {
  const { reglas } = await leerReglasDraft(admin, idJornada);
  return reglas?.camoteIds ?? new Set<string>();
}

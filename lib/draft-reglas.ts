import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export const LIMITE_TITULARES_PUNTUALES = 30;

export interface ReglasDraft {
  umbralTop: number;
  maxTopsPorEquipo: number;
  ratings: Record<string, number>;
  topsPresentes: Set<string>;
  topsPorEquipo: Map<string, Set<string>>;
  camotesPresentes: Set<string>;
  suplentesPresentes: Set<string>;
  invitadosPresentes: Set<string>;
  ordenPorUsuario: Map<string, number>;
}

export function esCamoteValido(u: { edad?: number | null; es_camote?: boolean | null } | null | undefined): boolean {
  if (!u) return false;
  return Boolean(u.es_camote && typeof u.edad === "number" && u.edad < 12);
}

function calcPromedio(stats: Record<string, number> | undefined): number | null {
  if (!stats) return null;
  const valores = Object.values(stats);
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export async function promediosGenerales(admin: Admin): Promise<Record<string, number>> {
  const { data } = await admin.from("valoraciones").select("id_evaluado, stats");
  const acumulado: Record<string, { suma: Record<string, number>; n: number }> = {};
  for (const fila of data ?? []) {
    const entry = (acumulado[fila.id_evaluado] ??= { suma: {}, n: 0 });
    entry.n += 1;
    for (const [clave, valor] of Object.entries((fila.stats ?? {}) as Record<string, number>)) {
      entry.suma[clave] = (entry.suma[clave] ?? 0) + Number(valor);
    }
  }
  const generales: Record<string, number> = {};
  for (const [id, { suma, n }] of Object.entries(acumulado)) {
    const promedios = Object.fromEntries(Object.entries(suma).map(([c, v]) => [c, v / n]));
    const g = calcPromedio(promedios);
    if (g != null) generales[id] = g;
  }
  return generales;
}

type AsistenciaRaw = {
  id_usuario: string;
  id_equipo: string | null;
  presente: boolean;
  es_invitado?: boolean;
  marcado_en?: string | null;
  id_asistencia?: string;
};

async function leerAsistenciasExtendidas(admin: Admin, idJornada: string): Promise<AsistenciaRaw[]> {
  const conNuevas = await admin
    .from("asistencia_draft")
    .select("id_asistencia, id_usuario, id_equipo, presente, es_invitado, marcado_en")
    .eq("id_jornada", idJornada);
  if (!conNuevas.error && conNuevas.data) {
    return conNuevas.data as AsistenciaRaw[];
  }
  const basicas = await admin
    .from("asistencia_draft")
    .select("id_asistencia, id_usuario, id_equipo, presente")
    .eq("id_jornada", idJornada);
  return (basicas.data ?? []) as AsistenciaRaw[];
}

export async function clasificarPresentesJornada(
  admin: Admin,
  idJornada: string
): Promise<{
  camotes: Set<string>;
  suplentes: Set<string>;
  invitados: Set<string>;
  titulares: Set<string>;
  ordenPorUsuario: Map<string, number>;
}> {
  const [asis, { data: equipos }] = await Promise.all([
    leerAsistenciasExtendidas(admin, idJornada),
    admin.from("equipos_jornada").select("id_capitan").eq("id_jornada", idJornada),
  ]);

  const presentesAsis = asis.filter((a) => a.presente);
  const ids = presentesAsis.map((a) => a.id_usuario);
  if (ids.length === 0) {
    return {
      camotes: new Set(),
      suplentes: new Set(),
      invitados: new Set(),
      titulares: new Set(),
      ordenPorUsuario: new Map(),
    };
  }

  const { data: usus } = await admin.from("usuarios").select("id_usuario, edad, es_camote").in("id_usuario", ids);
  const camotes = new Set<string>();
  for (const u of usus ?? []) {
    if (esCamoteValido(u as { edad?: number | null; es_camote?: boolean | null })) {
      camotes.add(u.id_usuario as string);
    }
  }

  const capitanesIds = new Set<string>(
    (equipos ?? []).map((e) => e.id_capitan as string | null).filter((id): id is string => Boolean(id))
  );

  const noCamotes = presentesAsis.filter((a) => !camotes.has(a.id_usuario));
  noCamotes.sort((a, b) => {
    const tA = a.marcado_en ? Date.parse(a.marcado_en) : Number.MAX_SAFE_INTEGER;
    const tB = b.marcado_en ? Date.parse(b.marcado_en) : Number.MAX_SAFE_INTEGER;
    if (tA !== tB) return tA - tB;
    return String(a.id_asistencia ?? a.id_usuario).localeCompare(String(b.id_asistencia ?? b.id_usuario));
  });

  const suplentes = new Set<string>();
  const invitados = new Set<string>();
  const titulares = new Set<string>();
  const ordenPorUsuario = new Map<string, number>();

  noCamotes.forEach((fila, index) => {
    const orden = index + 1;
    ordenPorUsuario.set(fila.id_usuario, orden);
    if (fila.es_invitado) invitados.add(fila.id_usuario);

    if (orden <= LIMITE_TITULARES_PUNTUALES || fila.es_invitado || capitanesIds.has(fila.id_usuario)) {
      titulares.add(fila.id_usuario);
    } else {
      suplentes.add(fila.id_usuario);
    }
  });

  return { camotes, suplentes, invitados, titulares, ordenPorUsuario };
}

export async function camotesPresentes(admin: Admin, idJornada: string): Promise<Set<string>> {
  const { camotes } = await clasificarPresentesJornada(admin, idJornada);
  return camotes;
}

export async function leerReglasDraft(admin: Admin, idJornada: string): Promise<ReglasDraft> {
  const [{ data: jornada }, { data: equipos }, asis, ratings, clasificacion] = await Promise.all([
    admin.from("jornadas").select("*").eq("id_jornada", idJornada).maybeSingle(),
    admin.from("equipos_jornada").select("id_equipo, id_capitan").eq("id_jornada", idJornada),
    leerAsistenciasExtendidas(admin, idJornada),
    promediosGenerales(admin),
    clasificarPresentesJornada(admin, idJornada),
  ]);

  const jRaw = (jornada ?? {}) as { umbral_top?: number | null; max_tops_por_equipo?: number | null };
  const umbralTop = typeof jRaw.umbral_top === "number" ? Number(jRaw.umbral_top) : 7.5;
  const numEquipos = Math.max(1, (equipos ?? []).length);

  const presentesTitulares = new Set<string>(clasificacion.titulares);
  for (const eq of equipos ?? []) {
    if (eq.id_capitan && !clasificacion.camotes.has(eq.id_capitan as string)) {
      presentesTitulares.add(eq.id_capitan as string);
    }
  }

  const topsPresentes = new Set<string>();
  for (const id of presentesTitulares) {
    if ((ratings[id] ?? 0) >= umbralTop) {
      topsPresentes.add(id);
    }
  }

  const manualMax = jRaw.max_tops_por_equipo;
  const maxTopsPorEquipo =
    typeof manualMax === "number" && manualMax >= 1
      ? manualMax
      : Math.max(1, Math.ceil(topsPresentes.size / numEquipos));

  const topsPorEquipo = new Map<string, Set<string>>();
  for (const eq of equipos ?? []) {
    const set = new Set<string>();
    if (eq.id_capitan && topsPresentes.has(eq.id_capitan as string)) {
      set.add(eq.id_capitan as string);
    }
    topsPorEquipo.set(eq.id_equipo as string, set);
  }
  for (const a of asis) {
    if (a.presente && a.id_equipo && topsPresentes.has(a.id_usuario)) {
      const set = topsPorEquipo.get(a.id_equipo) ?? new Set<string>();
      set.add(a.id_usuario);
      topsPorEquipo.set(a.id_equipo, set);
    }
  }

  return {
    umbralTop,
    maxTopsPorEquipo,
    ratings,
    topsPresentes,
    topsPorEquipo,
    camotesPresentes: clasificacion.camotes,
    suplentesPresentes: clasificacion.suplentes,
    invitadosPresentes: clasificacion.invitados,
    ordenPorUsuario: clasificacion.ordenPorUsuario,
  };
}

export function motivoBloqueo(reglas: ReglasDraft, idEquipo: string, idJugador: string): string | null {
  if (!reglas.topsPresentes.has(idJugador)) return null;
  const actuales = reglas.topsPorEquipo.get(idEquipo) ?? new Set<string>();
  if (actuales.has(idJugador)) return null;
  if (actuales.size >= reglas.maxTopsPorEquipo) {
    return `Este equipo ya alcanzó el tope de jugadores top (${reglas.maxTopsPorEquipo} de ≥ ${reglas.umbralTop.toFixed(1)}★ por equipo).`;
  }
  return null;
}

/**
 * Reparte a los Suplentes (puesto 31+ que no formaron un 6to equipo) usando equilibrio inverso:
 * - Si el suplente tiene media alta (>= media general), refuerza al equipo de MENOR promedio.
 * - Si el suplente tiene media baja (< media general), compensa entrando al equipo de MAYOR promedio.
 */
export async function colocarSuplentes(
  admin: Admin,
  idJornada: string
): Promise<{ asignados: { id_usuario: string; id_equipo: string }[] }> {
  const { suplentes, camotes } = await clasificarPresentesJornada(admin, idJornada);
  if (suplentes.size === 0) return { asignados: [] };

  const [{ data: equipos }, asis, ratings] = await Promise.all([
    admin.from("equipos_jornada").select("*").eq("id_jornada", idJornada).order("orden_turno", { ascending: true }),
    leerAsistenciasExtendidas(admin, idJornada),
    promediosGenerales(admin),
  ]);

  const listaEquipos = equipos ?? [];
  if (listaEquipos.length === 0) return { asignados: [] };

  const conocidos = Object.values(ratings).filter((v) => v > 0);
  const mediaGlobal = conocidos.length > 0 ? conocidos.reduce((a, b) => a + b, 0) / conocidos.length : 5.5;

  const rosterPorEquipo = new Map<string, string[]>();
  const suplentesEnEquipo = new Map<string, number>();
  for (const eq of listaEquipos) {
    rosterPorEquipo.set(eq.id_equipo as string, []);
    suplentesEnEquipo.set(eq.id_equipo as string, 0);
  }

  const suplentesSinEquipo: string[] = [];
  for (const a of asis) {
    if (!a.presente) continue;
    if (suplentes.has(a.id_usuario)) {
      if (a.id_equipo && suplentesEnEquipo.has(a.id_equipo)) {
        suplentesEnEquipo.set(a.id_equipo, (suplentesEnEquipo.get(a.id_equipo) ?? 0) + 1);
        rosterPorEquipo.get(a.id_equipo)!.push(a.id_usuario);
      } else if (!a.id_equipo) {
        suplentesSinEquipo.push(a.id_usuario);
      }
    } else if (!camotes.has(a.id_usuario) && a.id_equipo && rosterPorEquipo.has(a.id_equipo)) {
      rosterPorEquipo.get(a.id_equipo)!.push(a.id_usuario);
    }
  }

  if (suplentesSinEquipo.length === 0) return { asignados: [] };

  function promedioEquipo(idEq: string): number {
    const ids = rosterPorEquipo.get(idEq) ?? [];
    if (ids.length === 0) return mediaGlobal;
    const suma = ids.reduce((acc, id) => acc + (ratings[id] && ratings[id] > 0 ? ratings[id] : mediaGlobal), 0);
    return suma / ids.length;
  }

  const asignados: { id_usuario: string; id_equipo: string }[] = [];

  for (const idSuplente of suplentesSinEquipo) {
    const ratingSuplente = ratings[idSuplente] && ratings[idSuplente] > 0 ? ratings[idSuplente] : mediaGlobal;
    const minSuplentes = Math.min(...listaEquipos.map((eq) => suplentesEnEquipo.get(eq.id_equipo as string) ?? 0));
    const candidatos = listaEquipos.filter(
      (eq) => (suplentesEnEquipo.get(eq.id_equipo as string) ?? 0) === minSuplentes
    );

    candidatos.sort((a, b) => {
      const avgA = promedioEquipo(a.id_equipo as string);
      const avgB = promedioEquipo(b.id_equipo as string);
      // Si el suplente tiene mayor media -> va al equipo de menor promedio (avgA - avgB)
      // Si el suplente tiene menor media -> va al equipo de mayor promedio (avgB - avgA)
      if (Math.abs(avgA - avgB) > 0.001) {
        return ratingSuplente >= mediaGlobal ? avgA - avgB : avgB - avgA;
      }
      return ((a.orden_turno as number | null) ?? 0) - ((b.orden_turno as number | null) ?? 0);
    });

    const elegido = candidatos[0]!.id_equipo as string;
    const { error } = await admin
      .from("asistencia_draft")
      .update({ id_equipo: elegido })
      .eq("id_jornada", idJornada)
      .eq("id_usuario", idSuplente);

    if (!error) {
      suplentesEnEquipo.set(elegido, (suplentesEnEquipo.get(elegido) ?? 0) + 1);
      rosterPorEquipo.get(elegido)!.push(idSuplente);
      asignados.push({ id_usuario: idSuplente, id_equipo: elegido });
    }
  }

  return { asignados };
}

export async function colocarCamotes(
  admin: Admin,
  idJornada: string
): Promise<{ asignados: { id_usuario: string; id_equipo: string }[]; sinEquipo: { id_usuario: string; nombre: string }[] }> {
  const camotes = await camotesPresentes(admin, idJornada);
  if (camotes.size === 0) return { asignados: [], sinEquipo: [] };

  const [{ data: equipos }, { data: asistencias }, { data: usus }, ratings] = await Promise.all([
    admin.from("equipos_jornada").select("*").eq("id_jornada", idJornada).order("orden_turno", { ascending: true }),
    admin.from("asistencia_draft").select("id_usuario, id_equipo, presente").eq("id_jornada", idJornada).eq("presente", true),
    admin.from("usuarios").select("id_usuario, nombre").in("id_usuario", [...camotes]),
    promediosGenerales(admin),
  ]);

  const listaEquipos = equipos ?? [];
  if (listaEquipos.length === 0) return { asignados: [], sinEquipo: [] };

  const nombrePorId = new Map<string, string>((usus ?? []).map((u) => [u.id_usuario as string, (u.nombre as string) ?? "Camote"]));
  const camoteEnEquipo = new Map<string, string>();
  const titularesPorEquipo = new Map<string, string[]>();

  for (const eq of listaEquipos) {
    titularesPorEquipo.set(eq.id_equipo as string, []);
  }

  const camotesSinAsignar: string[] = [];

  for (const a of asistencias ?? []) {
    const uid = a.id_usuario as string;
    const eqId = (a.id_equipo as string | null) ?? null;
    if (camotes.has(uid)) {
      if (eqId && !camoteEnEquipo.has(eqId)) {
        camoteEnEquipo.set(eqId, uid);
      } else {
        if (eqId) {
          await admin.from("asistencia_draft").update({ id_equipo: null }).eq("id_jornada", idJornada).eq("id_usuario", uid);
        }
        camotesSinAsignar.push(uid);
      }
    } else if (eqId && titularesPorEquipo.has(eqId)) {
      titularesPorEquipo.get(eqId)!.push(uid);
    }
  }

  for (let i = camotesSinAsignar.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [camotesSinAsignar[i], camotesSinAsignar[j]] = [camotesSinAsignar[j]!, camotesSinAsignar[i]!];
  }

  function promedioEquipo(idEq: string): number {
    const ids = titularesPorEquipo.get(idEq) ?? [];
    const vals = ids.map((id) => ratings[id]).filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const asignados: { id_usuario: string; id_equipo: string }[] = [];
  const sinEquipo: { id_usuario: string; nombre: string }[] = [];

  for (const idCamote of camotesSinAsignar) {
    const candidatos = listaEquipos.filter((eq) => !camoteEnEquipo.has(eq.id_equipo as string));
    if (candidatos.length === 0) {
      sinEquipo.push({ id_usuario: idCamote, nombre: nombrePorId.get(idCamote) ?? "Camote" });
      continue;
    }

    candidatos.sort((a, b) => {
      const idA = a.id_equipo as string;
      const idB = b.id_equipo as string;
      const countA = (titularesPorEquipo.get(idA) ?? []).length;
      const countB = (titularesPorEquipo.get(idB) ?? []).length;
      if (countA !== countB) return countA - countB;
      const avgA = promedioEquipo(idA);
      const avgB = promedioEquipo(idB);
      if (Math.abs(avgA - avgB) > 0.001) return avgB - avgA;
      return ((a.orden_turno as number | null) ?? 0) - ((b.orden_turno as number | null) ?? 0);
    });

    const elegido = candidatos[0]!.id_equipo as string;
    const { error } = await admin
      .from("asistencia_draft")
      .update({ id_equipo: elegido })
      .eq("id_jornada", idJornada)
      .eq("id_usuario", idCamote);

    if (!error) {
      camoteEnEquipo.set(elegido, idCamote);
      asignados.push({ id_usuario: idCamote, id_equipo: elegido });
    }
  }

  return { asignados, sinEquipo };
}

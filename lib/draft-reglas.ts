import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export interface ReglasDraft {
  umbralTop: number;
  maxTopsPorEquipo: number;
  ratings: Record<string, number>;
  topsPresentes: Set<string>;
  topsPorEquipo: Map<string, Set<string>>;
  camotesPresentes: Set<string>;
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

export async function camotesPresentes(admin: Admin, idJornada: string): Promise<Set<string>> {
  const { data: asis } = await admin
    .from("asistencia_draft")
    .select("id_usuario, presente")
    .eq("id_jornada", idJornada)
    .eq("presente", true);

  const ids = (asis ?? []).map((a) => a.id_usuario as string);
  if (ids.length === 0) return new Set();

  const { data: usus, error } = await admin
    .from("usuarios")
    .select("id_usuario, edad, es_camote")
    .in("id_usuario", ids);

  if (error || !usus) return new Set();

  const resultado = new Set<string>();
  for (const u of usus) {
    if (esCamoteValido(u as { edad?: number | null; es_camote?: boolean | null })) {
      resultado.add(u.id_usuario as string);
    }
  }
  return resultado;
}

export async function leerReglasDraft(admin: Admin, idJornada: string): Promise<ReglasDraft> {
  const [{ data: jornada }, { data: equipos }, { data: asistencias }, ratings, camotes] = await Promise.all([
    admin.from("jornadas").select("*").eq("id_jornada", idJornada).maybeSingle(),
    admin.from("equipos_jornada").select("id_equipo, id_capitan").eq("id_jornada", idJornada),
    admin.from("asistencia_draft").select("id_usuario, id_equipo, presente").eq("id_jornada", idJornada),
    promediosGenerales(admin),
    camotesPresentes(admin, idJornada),
  ]);

  const jRaw = (jornada ?? {}) as { umbral_top?: number | null; max_tops_por_equipo?: number | null };
  const umbralTop = typeof jRaw.umbral_top === "number" ? Number(jRaw.umbral_top) : 7.5;
  const numEquipos = Math.max(1, (equipos ?? []).length);

  const presentesIds = new Set<string>();
  for (const a of asistencias ?? []) {
    if (a.presente && !camotes.has(a.id_usuario as string)) {
      presentesIds.add(a.id_usuario as string);
    }
  }
  for (const eq of equipos ?? []) {
    if (eq.id_capitan && !camotes.has(eq.id_capitan as string)) {
      presentesIds.add(eq.id_capitan as string);
    }
  }

  const topsPresentes = new Set<string>();
  for (const id of presentesIds) {
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
  for (const a of asistencias ?? []) {
    if (a.presente && a.id_equipo && topsPresentes.has(a.id_usuario as string)) {
      const set = topsPorEquipo.get(a.id_equipo as string) ?? new Set<string>();
      set.add(a.id_usuario as string);
      topsPorEquipo.set(a.id_equipo as string, set);
    }
  }

  return {
    umbralTop,
    maxTopsPorEquipo,
    ratings,
    topsPresentes,
    topsPorEquipo,
    camotesPresentes: camotes,
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

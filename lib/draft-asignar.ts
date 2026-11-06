import type { SupabaseClient } from "@supabase/supabase-js";
import {
  repartirConCupoDinamico,
  type JugadorReparto,
  type PosicionReparto,
} from "@/lib/draft-capacidad";
import {
  clasificarPresentesJornada,
  colocarCamotes,
  colocarSuplentes,
  promediosGenerales,
} from "@/lib/draft-reglas";

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

export async function ampliarCupoSiHaceFalta(admin: Admin, idEquipo: string) {
  const { data: equipo } = await admin.from("equipos_jornada").select("*").eq("id_equipo", idEquipo).maybeSingle();
  if (!equipo) return;
  const fila = equipo as FilaEquipo & { id_jornada?: string };

  const [{ data: asis }, clasificacion] = await Promise.all([
    admin.from("asistencia_draft").select("id_usuario").eq("id_equipo", idEquipo).eq("presente", true),
    fila.id_jornada
      ? clasificarPresentesJornada(admin, fila.id_jornada)
      : Promise.resolve({ camotes: new Set<string>(), suplentes: new Set<string>() }),
  ]);

  const ocupados = (asis ?? []).filter(
    (a) => !clasificacion.camotes.has(a.id_usuario as string) && !clasificacion.suplentes.has(a.id_usuario as string)
  ).length;
  const cupoActual = fila.cupo_max ?? 0;
  if (fila.cupo_max == null || ocupados <= cupoActual) return;

  const { error } = await admin.from("equipos_jornada").update({ cupo_max: ocupados }).eq("id_equipo", idEquipo);
  if (error) return;
  if (typeof fila.cupo_base !== "number") {
    await recordarCupoBase(admin, idEquipo, cupoActual);
  }
}

/**
 * Cuando hay más de 30 titulares (por ejemplo, 31 por un Invitado) y los cupos base se llenan,
 * el equipo que pasa a jugar con 7 se elige equilibrando que tenga al menos un jugador
 * de menor edad o menor nivel (o el menor promedio general).
 */
export async function colocarSobrantesEnJornada(
  admin: Admin,
  idJornada: string,
  opciones?: { soloSiNoHayCupo?: boolean }
): Promise<ResultadoColocacion> {
  const { equipos, error: errorEquipos } = await leerEquipos(admin, idJornada);
  if (errorEquipos) return { asignados: [], hayCupo: false, error: errorEquipos };
  if (equipos.length === 0) return { asignados: [], hayCupo: false };

  const [{ filas, error: errorAsistencias }, clasificacion, ratings, { data: usuariosData }] = await Promise.all([
    leerAsistencias(admin, idJornada),
    clasificarPresentesJornada(admin, idJornada),
    promediosGenerales(admin),
    admin.from("usuarios").select("id_usuario, edad"),
  ]);
  if (errorAsistencias) return { asignados: [], hayCupo: false, error: errorAsistencias };

  const edadPorId = new Map<string, number | null>(
    (usuariosData ?? []).map((u) => [u.id_usuario as string, (u.edad as number | null) ?? null])
  );
  const conocidos = Object.values(ratings).filter((v) => v > 0);
  const mediaGlobal = conocidos.length > 0 ? conocidos.reduce((a, b) => a + b, 0) / conocidos.length : 5.5;

  const rosterPorEquipo = new Map<string, string[]>();
  const ocupados = new Map<string, number>();
  for (const equipo of equipos) {
    ocupados.set(equipo.id_equipo, 0);
    rosterPorEquipo.set(equipo.id_equipo, []);
  }

  const sobrantes: string[] = [];
  for (const fila of filas) {
    if (!fila.presente || clasificacion.camotes.has(fila.id_usuario) || clasificacion.suplentes.has(fila.id_usuario)) {
      continue;
    }
    if (fila.id_equipo && ocupados.has(fila.id_equipo)) {
      ocupados.set(fila.id_equipo, (ocupados.get(fila.id_equipo) ?? 0) + 1);
      rosterPorEquipo.get(fila.id_equipo)!.push(fila.id_usuario);
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

  function puntajeMenorEdadONivel(idEquipo: string): number {
    const miembros = rosterPorEquipo.get(idEquipo) ?? [];
    if (miembros.length === 0) return 0;
    const minRating = Math.min(...miembros.map((id) => (ratings[id] && ratings[id] > 0 ? ratings[id] : mediaGlobal)));
    const edades = miembros.map((id) => edadPorId.get(id)).filter((e): e is number => typeof e === "number");
    const minEdad = edades.length > 0 ? Math.min(...edades) : 25;
    const prom = miembros.reduce((acc, id) => acc + (ratings[id] && ratings[id] > 0 ? ratings[id] : mediaGlobal), 0) / miembros.length;
    return minRating * 2 + prom + minEdad * 0.1;
  }

  const asignaciones: { idJugador: string; idEquipo: string }[] = [];

  for (const idSobrante of sobrantes) {
    const minOcupados = Math.min(...equipos.map((e) => ocupados.get(e.id_equipo) ?? 0));
    const candidatos = equipos.filter((e) => (ocupados.get(e.id_equipo) ?? 0) === minOcupados);

    // El equipo de 7 será aquel que tenga menor nivel/edad en su plantel para equilibrar el jugador extra
    candidatos.sort((a, b) => puntajeMenorEdadONivel(a.id_equipo) - puntajeMenorEdadONivel(b.id_equipo));
    const elegido = candidatos[0]!;

    const { error } = await admin
      .from("asistencia_draft")
      .update({ id_equipo: elegido.id_equipo })
      .eq("id_jornada", idJornada)
      .eq("id_usuario", idSobrante);
    if (error) return { asignados: [], hayCupo: false, error: error.message };

    const nuevoTotal = (ocupados.get(elegido.id_equipo) ?? 0) + 1;
    ocupados.set(elegido.id_equipo, nuevoTotal);
    rosterPorEquipo.get(elegido.id_equipo)!.push(idSobrante);
    asignaciones.push({ idJugador: idSobrante, idEquipo: elegido.id_equipo });

    if (elegido.cupo_max != null && nuevoTotal > elegido.cupo_max) {
      await admin.from("equipos_jornada").update({ cupo_max: nuevoTotal }).eq("id_equipo", elegido.id_equipo);
      if (typeof elegido.cupo_base !== "number") {
        await recordarCupoBase(admin, elegido.id_equipo, elegido.cupo_max);
      }
      elegido.cupo_max = nuevoTotal;
    }
  }

  return {
    asignados: asignaciones.map((a) => ({ id_usuario: a.idJugador, id_equipo: a.idEquipo })),
    hayCupo: false,
  };
}

async function siguienteEquipoConCupo(
  admin: Admin,
  idJornada: string,
  equipos: FilaEquipo[],
  idEquipoActual: string
): Promise<string | null> {
  const [{ filas }, clasificacion] = await Promise.all([
    leerAsistencias(admin, idJornada),
    clasificarPresentesJornada(admin, idJornada),
  ]);
  const ocupados = new Map<string, number>();
  let enBolsa = 0;
  for (const fila of filas) {
    if (!fila.presente || clasificacion.camotes.has(fila.id_usuario) || clasificacion.suplentes.has(fila.id_usuario)) {
      continue;
    }
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

  const [{ filas }, clasificacion] = await Promise.all([
    leerAsistencias(admin, idJornada),
    clasificarPresentesJornada(admin, idJornada),
  ]);
  const haySobrantes = filas.some(
    (fila) =>
      fila.presente &&
      !fila.id_equipo &&
      !clasificacion.camotes.has(fila.id_usuario) &&
      !clasificacion.suplentes.has(fila.id_usuario)
  );
  if (!haySobrantes) return { siguienteEquipo: null };

  const colocados = await colocarSobrantesEnJornada(admin, idJornada, { soloSiNoHayCupo: true });
  if (colocados.error) return { siguienteEquipo: null, error: colocados.error };
  if (colocados.hayCupo) {
    const deNuevo = await siguienteEquipoConCupo(admin, idJornada, equipos, idEquipoActual);
    return { siguienteEquipo: deNuevo };
  }
  return { siguienteEquipo: null };
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

  const [{ filas, error: errorAsistencias }, clasificacion] = await Promise.all([
    leerAsistencias(admin, idJornada),
    clasificarPresentesJornada(admin, idJornada),
  ]);
  if (errorAsistencias) return { error: errorAsistencias };

  for (const idExtra of [...clasificacion.camotes, ...clasificacion.suplentes]) {
    await admin
      .from("asistencia_draft")
      .update({ id_equipo: null })
      .eq("id_jornada", idJornada)
      .eq("id_usuario", idExtra);
  }

  const presentes = new Set(
    filas
      .filter(
        (fila) =>
          fila.presente &&
          !clasificacion.camotes.has(fila.id_usuario) &&
          !clasificacion.suplentes.has(fila.id_usuario)
      )
      .map((fila) => fila.id_usuario)
  );
  for (const equipo of equipos) {
    if (equipo.id_capitan && !clasificacion.camotes.has(equipo.id_capitan)) {
      presentes.add(equipo.id_capitan);
    }
  }
  if (presentes.size === 0) return { error: "No hay jugadores titulares presentes para sortear" };

  const { data: usuarios, error: errorUsuarios } = await admin
    .from("usuarios")
    .select("id_usuario, posicion, edad")
    .in("id_usuario", [...presentes]);
  if (errorUsuarios) return { error: errorUsuarios.message };

  const posicionPorId = new Map(
    (usuarios ?? []).map((usuario) => [usuario.id_usuario as string, (usuario.posicion ?? null) as PosicionReparto])
  );
  const edadPorId = new Map(
    (usuarios ?? []).map((usuario) => [usuario.id_usuario as string, (usuario.edad as number | null) ?? null])
  );
  const ratings = await promediosGenerales(admin);
  const conocidos = Object.values(ratings).filter((valor) => valor > 0);
  const media = conocidos.length > 0 ? conocidos.reduce((a, b) => a + b, 0) / conocidos.length : 5;

  const jugadores: JugadorReparto[] = [...presentes].map((id) => ({
    id,
    valoracion: ratings[id] && ratings[id] > 0 ? ratings[id] : media,
    posicion: posicionPorId.get(id) ?? null,
  }));

  const capitanesSet = new Set(equipos.map((e) => e.id_capitan).filter((id): id is string => Boolean(id)));

  const plan = repartirConCupoDinamico(
    jugadores,
    equipos.map((equipo) => ({
      id: equipo.id_equipo,
      cupoBase: cupoBaseDe(equipo) ?? 1,
      fijos: equipo.id_capitan && presentes.has(equipo.id_capitan) ? [equipo.id_capitan] : [],
    }))
  );

  // Si un equipo quedó con 7 jugadores (por un invitado en el puesto 31+),
  // aseguramos que tenga al menos un jugador de menor edad o menor valoración para equilibrar.
  const equipoConSiete = plan.find((eq) => eq.jugadores.length > eq.cupoBase);
  if (equipoConSiete) {
    const puntajesPorJugador = (id: string) => {
      const r = ratings[id] && ratings[id] > 0 ? ratings[id] : media;
      const e = edadPorId.get(id);
      return e != null && e < 18 ? r - 1.5 : r;
    };
    const todosNoCapitanes = [...presentes].filter((id) => !capitanesSet.has(id));
    todosNoCapitanes.sort((a, b) => puntajesPorJugador(a) - puntajesPorJugador(b));
    const jugadorMenorNivelOEdad = todosNoCapitanes[0];

    if (jugadorMenorNivelOEdad && !equipoConSiete.jugadores.includes(jugadorMenorNivelOEdad)) {
      const equipoOrigen = plan.find((eq) => eq.jugadores.includes(jugadorMenorNivelOEdad));
      const candidatoCambio = equipoConSiete.jugadores.find((id) => !capitanesSet.has(id));
      if (equipoOrigen && candidatoCambio) {
        equipoConSiete.jugadores = equipoConSiete.jugadores.map((id) =>
          id === candidatoCambio ? jugadorMenorNivelOEdad : id
        );
        equipoOrigen.jugadores = equipoOrigen.jugadores.map((id) =>
          id === jugadorMenorNivelOEdad ? candidatoCambio : id
        );
      }
    }
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

  await colocarSuplentes(admin, idJornada);
  await colocarCamotes(admin, idJornada);

  const { error: errorCierre } = await admin
    .from("jornadas")
    .update({ draft_estado: "finalizado", draft_turno_equipo_id: null })
    .eq("id_jornada", idJornada);
  if (errorCierre) return { error: errorCierre.message };

  return {};
}

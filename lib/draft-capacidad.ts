// Reparto de equipos con cupo dinámico.
//
// El cupo que define el admin (ej. 4 equipos × 6 = 24) es la base, no un
// techo que deje gente fuera. Si llegan más presentes que esa capacidad,
// cada sobrante entra a un equipo que ya existe y ese equipo pasa a N+1.
//
// `total % num_equipos` solo dice, después de un reparto parejo, cuántos
// equipos quedan con un jugador más que el resto. No es la cantidad de
// gente que sobra cuando el cupo base es más chico: 30 presentes y 24
// cupos dejan 6 afuera, aunque 30 % 4 sea 2. Esos 6 se reparten igual,
// de a uno, priorizando al equipo con menos jugadores para que la
// diferencia entre equipos sea como máximo +1.

export type PosicionReparto = "POR" | "DEF" | "MC" | "DEL" | null;

export type JugadorReparto = {
  id: string;
  valoracion: number;
  posicion: PosicionReparto;
};

export type EquipoReparto = {
  id: string;
  cupoBase: number;
  fijos: string[];
};

export type RosterResultado = {
  id: string;
  jugadores: string[];
  cupoBase: number;
  cupoEfectivo: number;
};

export type EquipoOcupacion = {
  id: string;
  /** null = sin límite (todavía no se definió cupo). */
  cupoBase: number | null;
  ocupados: number;
};

export type AsignacionExtra = {
  idJugador: string;
  idEquipo: string;
  cupoEfectivo: number | null;
};

export function excedenteSobreCupo(totalAsistentes: number, cuposBase: number[]): number {
  const capacidad = cuposBase.reduce((suma, cupo) => suma + (Number.isFinite(cupo) ? cupo : 0), 0);
  return Math.max(0, totalAsistentes - capacidad);
}

function indiceAleatorio(largo: number, rng: () => number) {
  if (largo <= 1) return 0;
  const crudo = Math.floor(rng() * largo);
  return Math.min(largo - 1, Math.max(0, crudo));
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = indiceAleatorio(i + 1, rng);
    const actual = copia[i];
    copia[i] = copia[j]!;
    copia[j] = actual!;
  }
  return copia;
}

function tieneEspacio(equipo: { cupo: number | null; ocupados: number }) {
  return equipo.cupo == null || equipo.ocupados < equipo.cupo;
}

/**
 * Mete jugadores que no entraron en el cupo base.
 * Primero ocupa huecos (equipos bajo su cupo). Si ya no hay huecos,
 * elige al azar entre los equipos con menos jugadores y sube el cupo
 * de ese equipo al nuevo tamaño.
 */
export function integrarSobrantes(
  equipos: EquipoOcupacion[],
  sobrantes: readonly string[],
  rng: () => number = Math.random
): { estado: { id: string; cupo: number | null; ocupados: number }[]; asignaciones: AsignacionExtra[] } {
  const estado = equipos.map((equipo) => ({
    id: equipo.id,
    cupo: equipo.cupoBase,
    ocupados: equipo.ocupados,
  }));
  const asignaciones: AsignacionExtra[] = [];
  if (estado.length === 0) return { estado, asignaciones };

  for (const idJugador of shuffle(sobrantes, rng)) {
    const conEspacio = estado.filter(tieneEspacio);
    const pool =
      conEspacio.length > 0
        ? conEspacio
        : estado.filter((equipo) => equipo.ocupados === Math.min(...estado.map((item) => item.ocupados)));
    const destino = pool[indiceAleatorio(pool.length, rng)];
    if (!destino) continue;
    destino.ocupados += 1;
    if (destino.cupo != null && destino.ocupados > destino.cupo) {
      destino.cupo = destino.ocupados;
    }
    asignaciones.push({
      idJugador,
      idEquipo: destino.id,
      cupoEfectivo: destino.cupo,
    });
  }

  return { estado, asignaciones };
}

function objetivosParejos(fijosPorEquipo: number[], total: number, rng: () => number): number[] {
  const n = fijosPorEquipo.length;
  if (n === 0) return [];
  const minimo = Math.floor(total / n);
  const equiposConExtra = total % n;
  const orden = shuffle(
    fijosPorEquipo.map((_, indice) => indice),
    rng
  );
  const objetivo = Array.from({ length: n }, () => minimo);
  for (let i = 0; i < equiposConExtra; i++) objetivo[orden[i]!] = minimo + 1;
  for (let i = 0; i < n; i++) {
    if (fijosPorEquipo[i]! > objetivo[i]!) objetivo[i] = fijosPorEquipo[i]!;
  }

  let suma = objetivo.reduce((acum, valor) => acum + valor, 0);
  while (suma > total) {
    let idx = -1;
    for (let i = 0; i < n; i++) {
      if (objetivo[i]! > fijosPorEquipo[i]! && (idx < 0 || objetivo[i]! > objetivo[idx]!)) idx = i;
    }
    if (idx < 0) break;
    objetivo[idx]!--;
    suma -= 1;
  }
  while (suma < total) {
    const piso = Math.min(...objetivo);
    const candidatos = objetivo.flatMap((valor, indice) => (valor === piso ? [indice] : []));
    const elegido = candidatos[indiceAleatorio(candidatos.length, rng)] ?? candidatos[0]!;
    objetivo[elegido]! += 1;
    suma += 1;
  }
  return objetivo;
}

/**
 * Reparte a todos los presentes. Equilibra valoración (snake) y reparte
 * porteros si alcanza. Si sobran respecto al cupo base, igual entran:
 * el cupo efectivo de ese equipo sube.
 */
export function repartirConCupoDinamico(
  jugadores: readonly JugadorReparto[],
  equipos: readonly EquipoReparto[],
  rng: () => number = Math.random
): RosterResultado[] {
  if (equipos.length === 0) return [];

  const porId = new Map(jugadores.map((jugador) => [jugador.id, jugador]));
  const ids = new Set<string>();
  for (const equipo of equipos) {
    for (const id of equipo.fijos) ids.add(id);
  }
  for (const jugador of jugadores) ids.add(jugador.id);

  const fijos = new Set(equipos.flatMap((equipo) => equipo.fijos));
  const objetivo = objetivosParejos(
    equipos.map((equipo) => equipo.fijos.length),
    ids.size,
    rng
  );

  const estado = equipos.map((equipo) => ({
    id: equipo.id,
    cupoBase: equipo.cupoBase,
    jugadores: [...equipo.fijos],
  }));

  const pool = shuffle(
    jugadores.filter((jugador) => !fijos.has(jugador.id)),
    rng
  );
  const porteros = pool.filter((jugador) => jugador.posicion === "POR");
  const resto = pool.filter((jugador) => jugador.posicion !== "POR");

  const tienePortero = (roster: string[]) => roster.some((id) => porId.get(id)?.posicion === "POR");

  const porterosLibres: JugadorReparto[] = [];
  for (const portero of porteros) {
    const destino = estado.find(
      (equipo, indice) => equipo.jugadores.length < objetivo[indice]! && !tienePortero(equipo.jugadores)
    );
    if (!destino) {
      porterosLibres.push(portero);
      continue;
    }
    destino.jugadores.push(portero.id);
  }

  const cola = shuffle([...porterosLibres, ...resto], rng);
  cola.sort((a, b) => b.valoracion - a.valoracion);

  let direccion = 1;
  while (cola.length > 0 && estado.some((equipo, indice) => equipo.jugadores.length < objetivo[indice]!)) {
    const orden = direccion === 1 ? estado : [...estado].reverse();
    let asigno = false;
    for (const equipo of orden) {
      if (cola.length === 0) break;
      const indice = estado.indexOf(equipo);
      if (equipo.jugadores.length >= objetivo[indice]!) continue;
      const siguiente = cola.shift();
      if (!siguiente) break;
      equipo.jugadores.push(siguiente.id);
      asigno = true;
    }
    if (!asigno) break;
    direccion *= -1;
  }

  const puestos = () => new Set(estado.flatMap((equipo) => equipo.jugadores));
  const faltantes = () => [...ids].filter((id) => !puestos().has(id));
  const pendientes = cola.length > 0 ? cola.map((jugador) => jugador.id) : faltantes();
  if (pendientes.length > 0) {
    const { asignaciones } = integrarSobrantes(
      estado.map((equipo, indice) => ({
        id: equipo.id,
        cupoBase: objetivo[indice]!,
        ocupados: equipo.jugadores.length,
      })),
      pendientes,
      rng
    );
    for (const asignacion of asignaciones) {
      const equipo = estado.find((item) => item.id === asignacion.idEquipo);
      if (equipo && !equipo.jugadores.includes(asignacion.idJugador)) {
        equipo.jugadores.push(asignacion.idJugador);
      }
    }
  }

  const siguenAfuera = faltantes();
  if (siguenAfuera.length > 0) {
    const { asignaciones } = integrarSobrantes(
      estado.map((equipo) => ({
        id: equipo.id,
        cupoBase: equipo.jugadores.length,
        ocupados: equipo.jugadores.length,
      })),
      siguenAfuera,
      rng
    );
    for (const asignacion of asignaciones) {
      const equipo = estado.find((item) => item.id === asignacion.idEquipo);
      if (equipo && !equipo.jugadores.includes(asignacion.idJugador)) {
        equipo.jugadores.push(asignacion.idJugador);
      }
    }
  }

  return estado.map((equipo) => ({
    id: equipo.id,
    jugadores: equipo.jugadores,
    cupoBase: equipo.cupoBase,
    cupoEfectivo: Math.max(equipo.cupoBase, equipo.jugadores.length),
  }));
}

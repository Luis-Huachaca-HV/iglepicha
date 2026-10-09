import assert from "node:assert/strict";
import test from "node:test";
import {
  excedenteSobreCupo,
  integrarSobrantes,
  repartirConCupoDinamico,
  type JugadorReparto,
} from "./draft-capacidad.ts";

function rngCero() {
  return 0;
}

function jugadores(n: number, posicion: JugadorReparto["posicion"] = null): JugadorReparto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `j${i + 1}`,
    valoracion: n - i,
    posicion,
  }));
}

function tamanos(resultado: { jugadores: string[] }[]) {
  return resultado.map((equipo) => equipo.jugadores.length).sort((a, b) => a - b);
}

function idsDe(resultado: { jugadores: string[] }[]) {
  return resultado.flatMap((equipo) => equipo.jugadores);
}

test("el excedente es quien no entra en los cupos base, no el módulo", () => {
  assert.equal(excedenteSobreCupo(25, [6, 6, 6, 6]), 1);
  assert.equal(excedenteSobreCupo(24, [6, 6, 6, 6]), 0);
  assert.equal(excedenteSobreCupo(30, [6, 6, 6, 6]), 6);
  assert.notEqual(excedenteSobreCupo(30, [6, 6, 6, 6]), 30 % 4);
});

test("un jugador de más entra a un solo equipo y ese cupo pasa de 6 a 7", () => {
  const equipos = ["A", "B", "C", "D"].map((id) => ({ id, cupoBase: 6, ocupados: 6 }));
  const { estado, asignaciones } = integrarSobrantes(equipos, ["extra"], rngCero);
  assert.equal(asignaciones.length, 1);
  assert.equal(asignaciones[0]?.idEquipo, "A");
  assert.equal(asignaciones[0]?.cupoEfectivo, 7);
  assert.deepEqual(
    estado.map((equipo) => equipo.ocupados),
    [7, 6, 6, 6]
  );
  assert.equal(
    estado.filter((equipo) => equipo.cupo === 7).length,
    1
  );
});

test("si todavía hay un hueco, el sobrante ocupa ese hueco y no agranda otro equipo", () => {
  const equipos = [
    { id: "A", cupoBase: 6, ocupados: 5 },
    { id: "B", cupoBase: 6, ocupados: 6 },
    { id: "C", cupoBase: 6, ocupados: 6 },
    { id: "D", cupoBase: 6, ocupados: 6 },
  ];
  const { estado, asignaciones } = integrarSobrantes(equipos, ["tarde"], rngCero);
  assert.equal(asignaciones[0]?.idEquipo, "A");
  assert.equal(asignaciones[0]?.cupoEfectivo, 6);
  assert.deepEqual(
    estado.map((equipo) => equipo.ocupados),
    [6, 6, 6, 6]
  );
});

test("varios sobrantes se reparten y la diferencia entre equipos queda en +1", () => {
  const equipos = ["A", "B", "C", "D"].map((id) => ({ id, cupoBase: 6, ocupados: 6 }));
  const { estado, asignaciones } = integrarSobrantes(
    equipos,
    ["e1", "e2", "e3", "e4", "e5", "e6"],
    rngCero
  );
  assert.equal(asignaciones.length, 6);
  const ocupados = estado.map((equipo) => equipo.ocupados);
  assert.equal(
    ocupados.reduce((a, b) => a + b, 0),
    30
  );
  assert.ok(Math.max(...ocupados) - Math.min(...ocupados) <= 1);
  assert.ok(ocupados.every((n) => n >= 6));
});

test("25 presentes y 4 cupos de 6: nadie queda fuera y un equipo juega con 7", () => {
  const resultado = repartirConCupoDinamico(
    jugadores(25),
    ["A", "B", "C", "D"].map((id) => ({ id, cupoBase: 6, fijos: [] })),
    rngCero
  );
  const todos = idsDe(resultado);
  assert.equal(todos.length, 25);
  assert.equal(new Set(todos).size, 25);
  assert.deepEqual(tamanos(resultado), [6, 6, 6, 7]);
  assert.ok(resultado.some((equipo) => equipo.cupoEfectivo === 7 && equipo.cupoBase === 6));
});

test("30 presentes tampoco se quedan en la bolsa", () => {
  const resultado = repartirConCupoDinamico(
    jugadores(30),
    ["A", "B", "C", "D"].map((id) => ({ id, cupoBase: 6, fijos: [] })),
    rngCero
  );
  assert.equal(idsDe(resultado).length, 30);
  assert.equal(new Set(idsDe(resultado)).size, 30);
  const sizes = tamanos(resultado);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  assert.ok(sizes.every((n) => n >= 6));
});

test("con los cupos justos nadie se agranda", () => {
  const resultado = repartirConCupoDinamico(
    jugadores(24),
    ["A", "B", "C", "D"].map((id) => ({ id, cupoBase: 6, fijos: [] }))
  );
  assert.deepEqual(tamanos(resultado), [6, 6, 6, 6]);
  assert.ok(resultado.every((equipo) => equipo.cupoEfectivo === 6));
});

test("el snake equilibra la valoración", () => {
  const lista = jugadores(8);
  const resultado = repartirConCupoDinamico(
    lista,
    [
      { id: "A", cupoBase: 4, fijos: [] },
      { id: "B", cupoBase: 4, fijos: [] },
    ],
    rngCero
  );
  const promedio = (ids: string[]) =>
    ids.reduce((suma, id) => suma + (lista.find((jugador) => jugador.id === id)?.valoracion ?? 0), 0) / ids.length;
  const a = promedio(resultado[0]!.jugadores);
  const b = promedio(resultado[1]!.jugadores);
  assert.equal(a, 4.5);
  assert.equal(b, 4.5);
});

test("hay un portero por equipo cuando alcanza", () => {
  const lista: JugadorReparto[] = [
    { id: "p1", valoracion: 8, posicion: "POR" },
    { id: "p2", valoracion: 5, posicion: "POR" },
    ...jugadores(8).map((jugador) => ({ ...jugador, id: `c${jugador.id}`, posicion: "DEL" as const })),
  ];
  const resultado = repartirConCupoDinamico(
    lista,
    [
      { id: "A", cupoBase: 5, fijos: [] },
      { id: "B", cupoBase: 5, fijos: [] },
    ],
    rngCero
  );
  const esPortero = (id: string) => lista.find((jugador) => jugador.id === id)?.posicion === "POR";
  assert.equal(resultado.length, 2);
  for (const equipo of resultado) {
    assert.equal(equipo.jugadores.filter(esPortero).length, 1);
  }
  assert.equal(idsDe(resultado).length, lista.length);
});

test("el capitán se queda en su equipo", () => {
  const resultado = repartirConCupoDinamico(
    [
      { id: "cap-a", valoracion: 4, posicion: null },
      { id: "cap-b", valoracion: 4, posicion: null },
      { id: "bueno", valoracion: 10, posicion: "DEL" },
      { id: "otro", valoracion: 3, posicion: "DEF" },
    ],
    [
      { id: "A", cupoBase: 2, fijos: ["cap-a"] },
      { id: "B", cupoBase: 2, fijos: ["cap-b"] },
    ],
    rngCero
  );
  assert.ok(resultado.find((equipo) => equipo.id === "A")?.jugadores.includes("cap-a"));
  assert.ok(resultado.find((equipo) => equipo.id === "B")?.jugadores.includes("cap-b"));
  assert.equal(new Set(idsDe(resultado)).size, 4);
});

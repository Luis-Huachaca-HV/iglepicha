"use client";

import { useEffect, useState } from "react";
import { Flame, Footprints, Handshake, Star, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUsuarios } from "@/lib/useUsuarios";
import { Avatar } from "@/components/Avatar";

type Tarjeta = {
  titulo: string;
  detalle: string;
  nombre: string | null;
  valor: string;
  icono: typeof Trophy;
};

function rachaMaxima(partidos: { id_equipo_a: string | null; id_equipo_b: string | null; marcador_a: number; marcador_b: number; inicio_ts: string | null; estado: string }[]) {
  const ordenados = [...partidos]
    .filter((p) => p.estado === "finalizado")
    .sort((a, b) => (a.inicio_ts ?? "").localeCompare(b.inicio_ts ?? ""));
  const racha = new Map<string, { actual: number; max: number }>();
  for (const partido of ordenados) {
    const a = partido.id_equipo_a;
    const b = partido.id_equipo_b;
    if (!a || !b || partido.marcador_a === partido.marcador_b) {
      if (a) racha.set(a, { actual: 0, max: racha.get(a)?.max ?? 0 });
      if (b) racha.set(b, { actual: 0, max: racha.get(b)?.max ?? 0 });
      continue;
    }
    const ganador = partido.marcador_a > partido.marcador_b ? a : b;
    const perdedor = ganador === a ? b : a;
    const previa = racha.get(ganador) ?? { actual: 0, max: 0 };
    const actual = previa.actual + 1;
    racha.set(ganador, { actual, max: Math.max(previa.max, actual) });
    racha.set(perdedor, { actual: 0, max: racha.get(perdedor)?.max ?? 0 });
  }
  let mejorId: string | null = null;
  let mejor = 0;
  for (const [id, valor] of racha) {
    if (valor.max > mejor) {
      mejor = valor.max;
      mejorId = id;
    }
  }
  return { idEquipo: mejorId, racha: mejor };
}

export function EstadisticasClient() {
  const { usuarios } = useUsuarios();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [cruces, setCruces] = useState<{ local: string; visita: string; marcador: string }[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const [valoraciones, eventos, asistencias, partidos, equipos, jornadaRes] = await Promise.all([
        supabase.from("valoraciones").select("id_evaluado, stats"),
        supabase.from("eventos_partido").select("accion, id_jugador"),
        supabase.from("asistencia_draft").select("id_usuario, presente"),
        supabase.from("mini_partidos").select("id_jornada, id_equipo_a, id_equipo_b, marcador_a, marcador_b, estado, inicio_ts"),
        supabase.from("equipos_jornada").select("id_equipo, id_jornada, id_capitan"),
        fetch("/api/jornada/active", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!vivo) return;

      const nombres = Object.fromEntries(usuarios.map((u) => [u.id_usuario, u.nombre]));
      const nombre = (id: string | null | undefined) => (id ? nombres[id] ?? "Jugador" : "Sin datos");

      const sumaRating = new Map<string, { suma: number; n: number; pases: number }>();
      for (const fila of valoraciones.data ?? []) {
        const stats = fila.stats as Record<string, number>;
        const valores = Object.values(stats);
        if (valores.length === 0) continue;
        const entry = sumaRating.get(fila.id_evaluado) ?? { suma: 0, n: 0, pases: 0 };
        entry.n += 1;
        entry.suma += valores.reduce((a, b) => a + b, 0) / valores.length;
        entry.pases += ((stats.pase_corto ?? 0) + (stats.pase_largo ?? 0)) / 2;
        sumaRating.set(fila.id_evaluado, entry);
      }
      let crack: string | null = null;
      let crackNota = 0;
      let asistidor: string | null = null;
      let asistidorNota = 0;
      for (const [id, entry] of sumaRating) {
        const general = entry.suma / entry.n;
        const pases = entry.pases / entry.n;
        if (general > crackNota) {
          crackNota = general;
          crack = id;
        }
        if (pases > asistidorNota) {
          asistidorNota = pases;
          asistidor = id;
        }
      }

      const goles = new Map<string, number>();
      for (const evento of eventos.data ?? []) {
        if (evento.accion !== "gol" || !evento.id_jugador) continue;
        goles.set(evento.id_jugador, (goles.get(evento.id_jugador) ?? 0) + 1);
      }
      let goleador: string | null = null;
      let maxGoles = 0;
      for (const [id, n] of goles) {
        if (n > maxGoles) {
          maxGoles = n;
          goleador = id;
        }
      }

      const presentes = new Map<string, number>();
      for (const fila of asistencias.data ?? []) {
        if (!fila.presente) continue;
        presentes.set(fila.id_usuario, (presentes.get(fila.id_usuario) ?? 0) + 1);
      }
      let comprometido: string | null = null;
      let maxPresencias = 0;
      for (const [id, n] of presentes) {
        if (n > maxPresencias) {
          maxPresencias = n;
          comprometido = id;
        }
      }

      const { idEquipo, racha } = rachaMaxima(partidos.data ?? []);
      const equipo = (equipos.data ?? []).find((e) => e.id_equipo === idEquipo);
      const nombreRacha = equipo ? `Equipo de ${nombre(equipo.id_capitan)}` : null;

      const idJornada = jornadaRes?.jornada?.id_jornada as string | undefined;
      const equiposJornada = (equipos.data ?? []).filter((e) => e.id_jornada === idJornada);
      const nombreEquipo = (id: string | null) => {
        const eq = equiposJornada.find((e) => e.id_equipo === id);
        return eq ? nombre(eq.id_capitan) : "Equipo";
      };
      const listaCruces = (partidos.data ?? [])
        .filter((p) => p.estado === "finalizado" && (!idJornada || p.id_jornada === idJornada))
        .slice(0, 6)
        .map((p) => ({
          local: nombreEquipo(p.id_equipo_a),
          visita: nombreEquipo(p.id_equipo_b),
          marcador: `${p.marcador_a} – ${p.marcador_b}`,
        }));

      setTarjetas([
        { titulo: "El Crack", detalle: "Mejor valoración", nombre: nombre(crack), valor: crackNota ? crackNota.toFixed(1) : "S/C", icono: Star },
        { titulo: "Goleador", detalle: "Más goles", nombre: nombre(goleador), valor: maxGoles ? String(maxGoles) : "0", icono: Footprints },
        { titulo: "Asistidor", detalle: "Mejor pase", nombre: nombre(asistidor), valor: asistidorNota ? asistidorNota.toFixed(1) : "S/C", icono: Handshake },
        { titulo: "Racha", detalle: "Victorias seguidas", nombre: nombreRacha, valor: racha ? String(racha) : "0", icono: Flame },
        { titulo: "Top asistencia", detalle: "Jornadas presente", nombre: nombre(comprometido), valor: maxPresencias ? String(maxPresencias) : "0", icono: Trophy },
      ]);
      setCruces(listaCruces);
      setCargando(false);
    }
    if (usuarios.length === 0) return;
    cargar();
    return () => {
      vivo = false;
    };
  }, [usuarios]);

  if (cargando) return <p className="text-mist">Cargando rankings…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Estadísticas</h1>
        <p className="text-sm text-mist">Lo que ya quedó registrado en las jornadas.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tarjetas.map((tarjeta) => {
          const Icono = tarjeta.icono;
          return (
            <article key={tarjeta.titulo} className="rounded-2xl border border-pitch-800 bg-pitch-900 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-floodlight">
                <Icono size={14} />
                <span className="text-[11px] font-bold uppercase tracking-wide">{tarjeta.titulo}</span>
              </div>
              {tarjeta.nombre && tarjeta.nombre !== "Sin datos" ? (
                <div className="flex items-center gap-2">
                  <Avatar nombre={tarjeta.nombre} color="#16a34a" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tarjeta.nombre}</p>
                    <p className="text-lg font-bold text-turf-400">{tarjeta.valor}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-mist">Todavía no hay datos.</p>
              )}
              <p className="mt-2 text-[11px] text-mist">{tarjeta.detalle}</p>
            </article>
          );
        })}
      </div>
      <section className="rounded-2xl border border-pitch-800 bg-pitch-900 p-4">
        <h2 className="mb-3 font-display text-lg font-bold">Head to head</h2>
        {cruces.length === 0 && <p className="text-sm text-mist">Esta jornada todavía no tiene partidos cerrados.</p>}
        <ul className="flex flex-col gap-2">
          {cruces.map((cruce, i) => (
            <li key={`${cruce.local}-${cruce.visita}-${i}`} className="flex items-center justify-between text-sm">
              <span className="truncate">{cruce.local}</span>
              <span className="mx-2 font-bold text-turf-400">{cruce.marcador}</span>
              <span className="truncate text-right">{cruce.visita}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

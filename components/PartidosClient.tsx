"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { CountdownTimer } from "@/components/CountdownTimer";
import { reproducirSilbato } from "@/lib/silbato";
import { useUsuarios } from "@/lib/useUsuarios";
import type { AsistenciaDraft, EquipoJornada, EventoPartido, Jornada, MiniPartido, SesionUsuario } from "@/lib/types";

const ICONO: Record<string, string> = { gol: "⚽", falta: "🟨" };

export function PartidosClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [equipos, setEquipos] = useState<EquipoJornada[]>([]);
  const { usuarios } = useUsuarios();
  const [asistencias, setAsistencias] = useState<AsistenciaDraft[]>([]);
  const [partido, setPartido] = useState<MiniPartido | null>(null);
  const [errorPartido, setErrorPartido] = useState<string | null>(null);
  const [esperandoSiguiente, setEsperandoSiguiente] = useState(false);
  const [eventos, setEventos] = useState<EventoPartido[]>([]);
  const [duracionMin, setDuracionMin] = useState(10);
  const [modalEvento, setModalEvento] = useState<"gol" | "falta" | null>(null);
  const [eventoEditando, setEventoEditando] = useState<EventoPartido | null>(null);
  const [modalEmpate, setModalEmpate] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [historial, setHistorial] = useState<
    { id_partido: string; fecha_hora: string | null; equipo_a: string; equipo_b: string; marcador_a: number; marcador_b: number }[]
  >([]);

  useEffect(() => {
    fetch("/api/partidos/historial", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHistorial(d.historial ?? []));
  }, [partido?.estado]);

  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";
  const puedeAnotar = esAdmin || sesion.rol_sistema === "capitan";

  const cargarEquiposYAsistencias = useCallback(async (idJornada: string) => {
    const [{ data: eq }, { data: asis }] = await Promise.all([
      supabase.from("equipos_jornada").select("*").eq("id_jornada", idJornada),
      supabase.from("asistencia_draft").select("*").eq("id_jornada", idJornada),
    ]);
    setEquipos((eq as EquipoJornada[]) || []);
    setAsistencias((asis as AsistenciaDraft[]) || []);
  }, []);

  const cargarPartidoActivo = useCallback(async (idJornada: string) => {
    const res = await fetch(`/api/partidos/activo?id_jornada=${idJornada}`);
    const data = await res.json();
    setPartido(data.partido ?? null);
    setErrorPartido(data.error ?? null);
    setEsperandoSiguiente(!!data.esperando);
    if (data.partido) setDuracionMin(Math.round(data.partido.duracion_seg / 60));
  }, []);

  const cargarJornada = useCallback(() => {
    fetch("/api/jornada/active", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setJornada(d.jornada);
        if (d.jornada) {
          cargarEquiposYAsistencias(d.jornada.id_jornada);
          cargarPartidoActivo(d.jornada.id_jornada);
        }
      });
  }, [cargarEquiposYAsistencias, cargarPartidoActivo]);

  useEffect(() => {
    cargarJornada();
  }, [cargarJornada]);

  // Red de seguridad si Realtime se cae (redes de celular, pantalla
  // bloqueada): reintenta solo cada pocos segundos o al volver a la app.
  useEffect(() => {
    const id = setInterval(cargarJornada, 5000);
    function alVolver() {
      if (document.visibilityState === "visible") cargarJornada();
    }
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [cargarJornada]);

  // Realtime: cualquier cambio en partidos/equipos de esta jornada refresca todo
  useEffect(() => {
    if (!jornada) return;
    const canal = supabase
      .channel(`partidos-${jornada.id_jornada}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mini_partidos", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarPartidoActivo(jornada.id_jornada)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos_jornada", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarEquiposYAsistencias(jornada.id_jornada)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [jornada?.id_jornada, cargarPartidoActivo, cargarEquiposYAsistencias]);

  // Realtime: eventos del partido actual (timeline)
  useEffect(() => {
    if (!partido) {
      setEventos([]);
      return;
    }
    supabase
      .from("eventos_partido")
      .select("*")
      .eq("id_partido", partido.id_partido)
      .order("creado_en", { ascending: false })
      .then(({ data }) => setEventos((data as EventoPartido[]) || []));

    const canal = supabase
      .channel(`eventos-${partido.id_partido}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "eventos_partido", filter: `id_partido=eq.${partido.id_partido}` },
        () => {
          supabase
            .from("eventos_partido")
            .select("*")
            .eq("id_partido", partido.id_partido)
            .order("creado_en", { ascending: false })
            .then(({ data }) => setEventos((data as EventoPartido[]) || []));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [partido?.id_partido]);

  // Red de seguridad: si estamos "esperando" el siguiente partido (recién
  // finalizó el anterior) reintenta cada 1.5s hasta que aparezca — así la
  // pantalla nunca se queda pegada esperando un evento realtime que se perdió.
  useEffect(() => {
    if (!esperandoSiguiente || !jornada) return;
    const id = setTimeout(() => cargarPartidoActivo(jornada.id_jornada), 1500);
    return () => clearTimeout(id);
  }, [esperandoSiguiente, jornada?.id_jornada, cargarPartidoActivo]);

  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id_usuario, u])), [usuarios]);
  const equiposMap = useMemo(() => Object.fromEntries(equipos.map((e) => [e.id_equipo, e])), [equipos]);

  function nombreEquipo(idEquipo: string | null) {
    if (!idEquipo) return "?";
    const e = equiposMap[idEquipo];
    return e ? `Equipo de ${usuariosMap[e.id_capitan ?? ""]?.nombre ?? "?"}` : "?";
  }

  function rosterEquipo(idEquipo: string | null) {
    if (!idEquipo) return [];
    return asistencias.filter((a) => a.id_equipo === idEquipo).map((a) => usuariosMap[a.id_usuario]).filter(Boolean);
  }

  const rosterAmbos = useMemo(
    () => (partido ? [...rosterEquipo(partido.id_equipo_a), ...rosterEquipo(partido.id_equipo_b)] : []),
    [partido, asistencias, usuariosMap]
  );

  const cola = useMemo(
    () => equipos.filter((e) => e.orden_cola !== null).sort((a, b) => (a.orden_cola ?? 0) - (b.orden_cola ?? 0)),
    [equipos]
  );

  async function iniciarPartido() {
    if (!partido) return;
    setCargando(true);
    await fetch("/api/partidos/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_partido: partido.id_partido, duracion_seg: duracionMin * 60 }),
    });
    setCargando(false);
  }

  async function agregarEvento(idJugador: string) {
    if (!partido || !modalEvento) return;
    setCargando(true);
    await fetch("/api/partidos/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_partido: partido.id_partido, accion: modalEvento, id_jugador: idJugador }),
    });
    setCargando(false);
    setModalEvento(null);
  }

  async function borrarEvento(idEvento: string) {
    await fetch(`/api/partidos/evento/${idEvento}`, { method: "DELETE" });
    setEventoEditando(null);
  }

  async function reiniciarPartido() {
    if (!partido) return;
    setCargando(true);
    await fetch("/api/partidos/reiniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_partido: partido.id_partido }),
    });
    setCargando(false);
    if (jornada) cargarPartidoActivo(jornada.id_jornada);
  }

  async function finalizarPartido(idEquipoGanador?: string) {
    if (!partido) return;
    if (partido.marcador_a === partido.marcador_b && !idEquipoGanador) {
      setModalEmpate(true);
      return;
    }
    setCargando(true);
    await fetch("/api/partidos/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_partido: partido.id_partido, id_equipo_ganador: idEquipoGanador }),
    });
    setCargando(false);
    setModalEmpate(false);
    if (jornada) cargarPartidoActivo(jornada.id_jornada);
  }

  if (!jornada) return <p className="text-mist">Cargando…</p>;

  if (!partido) {
    if (esperandoSiguiente) {
      return (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="h-2 w-2 animate-pulseDot rounded-full bg-floodlight" />
          <p className="text-sm text-mist">Armando el siguiente partido…</p>
        </div>
      );
    }
    return (
      <div className="rounded border border-dashed border-pitch-700 p-6 text-center">
        <p className="text-chalk">{errorPartido ?? "Todavía no hay partido."}</p>
        <p className="mt-2 text-sm text-mist">Completa el Draft en la pestaña Draft para armar los equipos.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Partidos</h1>
        <p className="text-sm text-mist">{nombreEquipo(partido.id_equipo_a)} vs {nombreEquipo(partido.id_equipo_b)}</p>
      </div>

      {/* Marcador */}
      <div className="rounded border border-pitch-800 bg-pitch-900 p-5 text-center">
        <div className="flex items-center justify-center gap-6">
          <span className="max-w-[35%] font-display text-sm font-bold leading-tight">{nombreEquipo(partido.id_equipo_a)}</span>
          <span className="font-display tabular text-4xl font-bold text-turf-400">
            {partido.marcador_a} – {partido.marcador_b}
          </span>
          <span className="max-w-[35%] font-display text-sm font-bold leading-tight">{nombreEquipo(partido.id_equipo_b)}</span>
        </div>
      </div>

      {esAdmin && partido.estado !== "finalizado" && (
        <button
          onClick={reiniciarPartido}
          disabled={cargando}
          className="w-full rounded border border-dashed border-pitch-700 py-2 text-xs text-mist disabled:opacity-50"
        >
          Reiniciar partido (solo pruebas — vuelve a 0-0 y borra la timeline)
        </button>
      )}

      {partido.estado === "pendiente" && (
        <div className="rounded border border-pitch-800 bg-pitch-900 p-4">
          <p className="mb-3 text-center text-sm text-mist">Partido por iniciar</p>
          {esAdmin ? (
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between text-sm">
                Duración (min)
                <input
                  type="number"
                  min={1}
                  value={duracionMin}
                  onChange={(e) => setDuracionMin(Number(e.target.value))}
                  className="w-20 rounded border border-pitch-700 bg-pitch-950 px-2 py-2 text-center"
                />
              </label>
              <button
                onClick={iniciarPartido}
                disabled={cargando}
                className="w-full rounded-pill bg-turf-500 py-3 font-display font-bold text-pitch-950 disabled:opacity-50"
              >
                Iniciar partido
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-mist">Esperando a que el admin lo inicie.</p>
          )}
        </div>
      )}

      {partido.estado === "en_curso" && (
        <>
          <CountdownTimer
            inicioTs={partido.inicio_ts}
            totalSeg={partido.duracion_seg}
            enCurso
            onLlegarACero={reproducirSilbato}
          />

          {puedeAnotar && (
            <div className="flex gap-3">
              <button
                onClick={() => setModalEvento("gol")}
                className="flex-1 rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950"
              >
                ⚽ Gol
              </button>
              <button
                onClick={() => setModalEvento("falta")}
                className="flex-1 rounded-pill border border-card-yellow py-3 text-sm font-bold text-card-yellow"
              >
                🟨 Falta
              </button>
            </div>
          )}

          {esAdmin && (
            <button
              onClick={() => finalizarPartido()}
              disabled={cargando}
              className="w-full rounded-pill bg-card-red py-3 font-display font-bold text-chalk disabled:opacity-50"
            >
              Finalizar partido
            </button>
          )}
        </>
      )}

      {/* Timeline */}
      <div>
        <h2 className="mb-2 font-display text-lg font-bold">Timeline</h2>
        <ul className="flex flex-col divide-y divide-pitch-800">
          {eventos.map((ev) => (
            <li key={ev.id_evento} className="flex items-center justify-between py-2">
              <span className="text-sm">
                {ICONO[ev.accion]} {usuariosMap[ev.id_jugador ?? ""]?.nombre ?? "Jugador"}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-mist">
                  {new Date(ev.creado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {esAdmin && (
                  <button onClick={() => setEventoEditando(ev)} className="text-xs text-mist underline underline-offset-2">
                    editar
                  </button>
                )}
              </span>
            </li>
          ))}
          {eventos.length === 0 && <p className="py-3 text-sm text-mist">Sin eventos todavía.</p>}
        </ul>
      </div>

      {/* Cola de espera */}
      {cola.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-lg font-bold">Cola de espera</h2>
          <ul className="flex flex-col gap-1.5">
            {cola.map((e, i) => (
              <li key={e.id_equipo} className="flex items-center gap-2 text-sm text-mist">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pitch-800 text-xs">{i + 1}</span>
                {nombreEquipo(e.id_equipo)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Historial: lo único que se conserva entre jornadas */}
      {historial.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-lg font-bold">Historial</h2>
          {Object.entries(
            historial.reduce<Record<string, typeof historial>>((grupos, p) => {
              const fecha = p.fecha_hora
                ? new Date(p.fecha_hora).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
                : "Sin fecha";
              (grupos[fecha] ??= []).push(p);
              return grupos;
            }, {})
          ).map(([fecha, partidosDia]) => (
            <div key={fecha} className="mb-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-mist">{fecha}</p>
              <ul className="flex flex-col divide-y divide-pitch-800">
                {partidosDia.map((p) => (
                  <li key={p.id_partido} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-mist">
                      {p.fecha_hora
                        ? new Date(p.fecha_hora).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
                        : "--:--"}
                    </span>
                    <span>
                      {p.equipo_a} <strong>{p.marcador_a}-{p.marcador_b}</strong> {p.equipo_b}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Modal: agregar evento */}
      {modalEvento && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setModalEvento(null)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-xl font-bold">
              {ICONO[modalEvento]} ¿Quién {modalEvento === "gol" ? "anotó" : "cometió la falta"}?
            </h2>
            <ul className="flex max-h-72 flex-col divide-y divide-pitch-800 overflow-y-auto">
              {rosterAmbos.map((u) => (
                <li key={u.id_usuario}>
                  <button onClick={() => agregarEvento(u.id_usuario)} className="w-full py-2.5 text-left text-sm">
                    {u.nombre}
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setModalEvento(null)} className="mt-4 w-full rounded-pill border border-pitch-700 py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal: editar/borrar evento */}
      {eventoEditando && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm" onClick={() => setEventoEditando(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-pitch-700 bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm text-mist">Evento</p>
            <p className="mb-6 font-display text-xl font-bold">
              {ICONO[eventoEditando.accion]} {usuariosMap[eventoEditando.id_jugador ?? ""]?.nombre}
            </p>
            <button
              onClick={() => borrarEvento(eventoEditando.id_evento)}
              className="mb-2 w-full rounded-pill bg-card-red py-3 text-sm font-bold text-chalk"
            >
              Borrar evento (se cargó mal)
            </button>
            <button onClick={() => setEventoEditando(null)} className="w-full rounded-pill border border-pitch-700 py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal: empate, elegir quién sigue */}
      {modalEmpate && partido && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm" onClick={() => setModalEmpate(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-pitch-700 bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 font-display text-xl font-bold">Empate — ¿quién continúa?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => finalizarPartido(partido.id_equipo_a!)}
                className="rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950"
              >
                {nombreEquipo(partido.id_equipo_a)}
              </button>
              <button
                onClick={() => finalizarPartido(partido.id_equipo_b!)}
                className="rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950"
              >
                {nombreEquipo(partido.id_equipo_b)}
              </button>
            </div>
            <button onClick={() => setModalEmpate(false)} className="mt-4 w-full rounded-pill border border-pitch-700 py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

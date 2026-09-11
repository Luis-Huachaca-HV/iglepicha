"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUsuarios, type UsuarioLista } from "@/lib/useUsuarios";
import type { AsistenciaDraft, EquipoJornada, Jornada, SesionUsuario } from "@/lib/types";

function promedioGeneral(stats: Record<string, number> | undefined): number | null {
  if (!stats) return null;
  const valores = Object.values(stats);
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function DraftClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);

  // Canal SIEMPRE activo (no depende de tener ya una jornada cargada):
  // avisa al instante si nace una jornada nueva en cualquier dispositivo
  // (Reiniciar todo / Comenzar jornada nueva), sin esperar el sondeo de 5s.
  useEffect(() => {
    const canalNuevaJornada = supabase
      .channel(`jornada-nueva-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jornadas" }, () => cargarJornada())
      .subscribe();
    return () => {
      supabase.removeChannel(canalNuevaJornada);
    };
  }, []);

  const [equipos, setEquipos] = useState<EquipoJornada[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaDraft[]>([]);
  const { usuarios } = useUsuarios();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [cupos, setCupos] = useState<Record<string, number>>({});
  const [candidato, setCandidato] = useState<UsuarioLista | null>(null);
  const [tradeAbierto, setTradeAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";

  const cargarTodo = useCallback(async (idJornada: string) => {
    const [{ data: eq }, { data: asis }] = await Promise.all([
      supabase.from("equipos_jornada").select("*").eq("id_jornada", idJornada).order("orden_turno", { ascending: true }),
      supabase.from("asistencia_draft").select("*").eq("id_jornada", idJornada),
    ]);
    setEquipos((eq as EquipoJornada[]) || []);
    setAsistencias((asis as AsistenciaDraft[]) || []);
  }, []);

  const cargarJornada = useCallback(() => {
    fetch("/api/jornada/active", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.jornada) return; // sondeo fallido: nunca borrar lo que ya está en pantalla
        setJornada(d.jornada);
        cargarTodo(d.jornada.id_jornada);
      })
      .catch(() => {});
  }, [cargarTodo]);

  useEffect(() => {
    cargarJornada();
    supabase
      .from("valoraciones")
      .select("id_evaluado, stats")
      .then(({ data }) => {
        const acumulado: Record<string, { suma: Record<string, number>; n: number }> = {};
        (data || []).forEach((v) => {
          const entry = (acumulado[v.id_evaluado] ??= { suma: {}, n: 0 });
          entry.n += 1;
          Object.entries(v.stats as Record<string, number>).forEach(([k, val]) => {
            entry.suma[k] = (entry.suma[k] ?? 0) + val;
          });
        });
        const generales: Record<string, number> = {};
        Object.entries(acumulado).forEach(([id, { suma, n }]) => {
          const promedios = Object.fromEntries(Object.entries(suma).map(([k, v]) => [k, v / n]));
          generales[id] = promedioGeneral(promedios) ?? 0;
        });
        setRatings(generales);
      });
  }, [cargarJornada]);

  // Red de seguridad: Realtime a veces se cae solo en redes de celular
  // (pantalla bloqueada, señal débil). Sin esto, si el WebSocket se cae,
  // la pantalla se queda pegada hasta que alguien la recargue a mano.
  // Con esto, se autocorrige sola cada pocos segundos o al volver a la app.
  useEffect(() => {
    const id = setInterval(cargarJornada, 5000);
    function alVolver() {
      if (document.visibilityState === "visible") cargarJornada();
    }
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    // Safari/iOS a veces restaura la página "congelada" desde el gesto de
    // volver atrás (bfcache) en vez de recargarla — sin esto, se queda con
    // datos de una jornada que ya no existe.
    function alRestaurarBfcache(e: PageTransitionEvent) {
      if (e.persisted) alVolver();
    }
    window.addEventListener("pageshow", alRestaurarBfcache);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("pageshow", alRestaurarBfcache);
    };
  }, [cargarJornada]);

  useEffect(() => {
    if (!jornada) return;
    const canal = supabase
      .channel(`draft-${jornada.id_jornada}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asistencia_draft", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarTodo(jornada.id_jornada)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos_jornada", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarTodo(jornada.id_jornada)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jornadas", filter: `id_jornada=eq.${jornada.id_jornada}` },
        (payload) => setJornada(payload.new as Jornada)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [jornada?.id_jornada, cargarTodo]);

  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id_usuario, u])), [usuarios]);
  const asistenciaPorUsuario = useMemo(
    () => Object.fromEntries(asistencias.map((a) => [a.id_usuario, a])),
    [asistencias]
  );

  const presentes = useMemo(() => usuarios.filter((u) => asistenciaPorUsuario[u.id_usuario]?.presente), [
    usuarios,
    asistenciaPorUsuario,
  ]);
  const ausentes = useMemo(() => usuarios.filter((u) => !asistenciaPorUsuario[u.id_usuario]?.presente), [
    usuarios,
    asistenciaPorUsuario,
  ]);

  const bolsa = useMemo(
    () => presentes.filter((u) => !asistenciaPorUsuario[u.id_usuario]?.id_equipo),
    [presentes, asistenciaPorUsuario]
  );

  function rosterDe(idEquipo: string) {
    return asistencias.filter((a) => a.id_equipo === idEquipo).map((a) => usuariosMap[a.id_usuario]).filter(Boolean);
  }

  function promedioEquipo(idEquipo: string) {
    const roster = rosterDe(idEquipo);
    const clasificados = roster.map((u) => ratings[u.id_usuario]).filter((r): r is number => r !== undefined && r > 0);
    const sinClasificar = roster.length - clasificados.length;
    const avg = clasificados.length ? clasificados.reduce((a, b) => a + b, 0) / clasificados.length : null;
    return { avg, sinClasificar, total: roster.length };
  }

  async function iniciarDraft() {
    if (!jornada) return;
    const faltan = equipos.some((e) => !cupos[e.id_equipo]);
    if (faltan) {
      setError("Define el cupo de cada equipo");
      return;
    }
    setCargando(true);
    setError(null);
    const res = await fetch("/api/draft/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, cupos }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) return setError(data.error);
    setJornada(data.jornada);
    cargarTodo(jornada.id_jornada);
  }

  async function confirmarPick() {
    if (!jornada || !candidato || !jornada.draft_turno_equipo_id) return;
    setCargando(true);
    setError(null);
    const res = await fetch("/api/draft/elegir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_jornada: jornada.id_jornada,
        id_equipo: jornada.draft_turno_equipo_id,
        id_usuario: candidato.id_usuario,
      }),
    });
    const data = await res.json();
    setCargando(false);
    setCandidato(null);
    if (!res.ok) {
      setError(data.error);
      if (data.jornadaInvalida) cargarJornada();
      return;
    }
    setJornada(data.jornada);
  }

  async function togglePostDraft(permitir: boolean) {
    if (!jornada) return;
    const res = await fetch("/api/draft/toggle-cambios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, permitir }),
    });
    const data = await res.json();
    if (res.ok) setJornada(data.jornada);
  }

  async function mover(idUsuario: string, idEquipoDestino: string | null) {
    if (!jornada) return;
    setTradeAbierto(null);
    await fetch("/api/draft/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, id_equipo_destino: idEquipoDestino }),
    });
    cargarTodo(jornada.id_jornada);
  }

  if (!jornada) return <p className="text-mist">Cargando…</p>;

  const equipoEnTurno = equipos.find((e) => e.id_equipo === jornada.draft_turno_equipo_id) || null;
  const esSuperAdmin = sesion.rol_sistema === "super_admin";
  const esMiTurno = esSuperAdmin || equipoEnTurno?.id_capitan === sesion.id_usuario;

  // ---------- Sin equipos suficientes ----------
  if (equipos.length < 2) {
    return (
      <div className="rounded border border-dashed border-pitch-700 p-6 text-center">
        <p className="text-chalk">Todavía no hay al menos 2 equipos con capitán.</p>
        <p className="mt-2 text-sm text-mist">Ve a la pestaña Jugadores → "Elegir capitanes y cantidad de equipos".</p>
      </div>
    );
  }

  // ---------- Setup: no iniciado ----------
  if (jornada.draft_estado === "no_iniciado") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Draft</h1>
          <p className="text-sm text-mist">{presentes.length} jugadores presentes en total.</p>
          {ausentes.length > 0 && (
            <p className="mt-1 text-xs text-mist">
              Faltan {ausentes.length}: {ausentes.map((u) => u.nombre).join(", ")}
            </p>
          )}
        </div>
        <ul className="flex flex-col gap-3">
          {equipos.map((e) => (
            <li key={e.id_equipo} className="flex items-center justify-between rounded border border-pitch-800 bg-pitch-900 px-4 py-3">
              <span className="font-medium">Equipo de {usuariosMap[e.id_capitan ?? ""]?.nombre ?? "?"}</span>
              {esAdmin ? (
                <input
                  type="number"
                  min={1}
                  placeholder="Cupo"
                  value={cupos[e.id_equipo] ?? ""}
                  onChange={(ev) => setCupos((prev) => ({ ...prev, [e.id_equipo]: Number(ev.target.value) }))}
                  className="w-16 rounded border border-pitch-700 bg-pitch-950 px-2 py-2 text-center text-sm"
                />
              ) : (
                <span className="text-xs text-mist">Cupo por definir</span>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-card-red">{error}</p>}
        {esAdmin ? (
          <button
            onClick={iniciarDraft}
            disabled={cargando}
            className="w-full rounded-pill bg-turf-500 py-4 font-display text-lg font-bold text-pitch-950 disabled:opacity-50"
          >
            Iniciar draft
          </button>
        ) : (
          <p className="text-center text-sm text-mist">Esperando a que el admin defina los cupos e inicie el draft.</p>
        )}
      </div>
    );
  }

  // ---------- En curso / finalizado ----------
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Draft</h1>
        {jornada.draft_estado === "en_curso" ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-floodlight">
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-floodlight" />
            Turno de {usuariosMap[equipoEnTurno?.id_capitan ?? ""]?.nombre ?? "…"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-turf-400">Draft finalizado</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {equipos.map((e) => {
          const roster = rosterDe(e.id_equipo);
          const { avg, sinClasificar, total } = promedioEquipo(e.id_equipo);
          const enTurno = e.id_equipo === jornada.draft_turno_equipo_id;
          return (
            <div
              key={e.id_equipo}
              className={`rounded border bg-pitch-900 p-4 ${enTurno ? "border-floodlight" : "border-pitch-800"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display font-bold">Equipo de {usuariosMap[e.id_capitan ?? ""]?.nombre ?? "?"}</span>
                <span className="text-xs text-mist">
                  {total}/{e.cupo_max ?? "—"} · prom {avg ? avg.toFixed(1) : "S/C"}
                  {sinClasificar > 0 ? ` (${sinClasificar} S/C)` : ""}
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {roster.map((u) => (
                  <li key={u.id_usuario}>
                    <button
                      disabled={!esAdmin || !jornada.permitir_cambios_post_draft || jornada.draft_estado !== "finalizado"}
                      onClick={() => setTradeAbierto(u.id_usuario)}
                      className="rounded-pill bg-pitch-800 px-3 py-2 text-xs disabled:opacity-100"
                    >
                      {u.nombre}
                    </button>
                  </li>
                ))}
                {roster.length === 0 && <li className="text-xs text-mist">Sin jugadores aún</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {jornada.draft_estado === "en_curso" && (
        <div>
          <h2 className="mb-2 font-display text-lg font-bold">Bolsa ({bolsa.length})</h2>
          {error && <p className="mb-2 text-sm text-card-red">{error}</p>}
          <ul className="flex flex-col divide-y divide-pitch-800">
            {bolsa.map((u) => (
              <li key={u.id_usuario}>
                <button
                  disabled={!esMiTurno || cargando}
                  onClick={() => setCandidato(u)}
                  className="flex w-full items-center justify-between py-3 text-left disabled:opacity-40"
                >
                  <span>
                    <span className="block text-sm font-medium">{u.nombre}</span>
                    <span className="block text-xs text-mist">
                    {u.edad ? `${u.edad} años` : "Edad no registrada"}
                    {u.posicion ? ` · ${u.posicion}` : ""}
                  </span>
                  </span>
                  <span className="font-display text-sm font-bold text-turf-400">
                    {ratings[u.id_usuario] ? ratings[u.id_usuario].toFixed(1) : "S/C"}
                  </span>
                </button>
              </li>
            ))}
            {bolsa.length === 0 && <p className="py-4 text-sm text-mist">La bolsa está vacía.</p>}
          </ul>
          {!esMiTurno && (
            <p className="mt-2 text-xs text-mist">
              Solo {usuariosMap[equipoEnTurno?.id_capitan ?? ""]?.nombre ?? "el capitán en turno"} puede elegir ahora.
            </p>
          )}
        </div>
      )}

      {jornada.draft_estado === "finalizado" && esAdmin && (
        <label className="flex items-center justify-between rounded border border-pitch-800 bg-pitch-900 px-4 py-3">
          <span className="text-sm">Permitir cambios post-draft</span>
          <input
            type="checkbox"
            checked={jornada.permitir_cambios_post_draft}
            onChange={(e) => togglePostDraft(e.target.checked)}
            className="h-5 w-5 accent-turf-500"
          />
        </label>
      )}

      {/* Confirmación de pick */}
      {candidato && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm" onClick={() => setCandidato(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-pitch-700 bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-mist">¿Confirmar a</p>
            <p className="font-display text-2xl font-bold">{candidato.nombre}</p>
            <p className="mb-6 text-sm text-mist">
              para el equipo de {usuariosMap[equipoEnTurno?.id_capitan ?? ""]?.nombre}?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCandidato(null)} className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm">
                Cancelar
              </button>
              <button
                onClick={confirmarPick}
                disabled={cargando}
                className="flex-1 rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mover jugador (cambios post-draft) */}
      {tradeAbierto && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setTradeAbierto(null)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-xl font-bold">Mover a {usuariosMap[tradeAbierto]?.nombre}</h2>
            <ul className="flex flex-col gap-2">
              {equipos
                .filter((e) => e.id_equipo !== asistenciaPorUsuario[tradeAbierto]?.id_equipo)
                .map((e) => (
                  <li key={e.id_equipo}>
                    <button
                      onClick={() => mover(tradeAbierto, e.id_equipo)}
                      className="w-full rounded bg-pitch-800 px-3 py-2 text-left text-sm"
                    >
                      Equipo de {usuariosMap[e.id_capitan ?? ""]?.nombre}
                    </button>
                  </li>
                ))}
              <li>
                <button onClick={() => mover(tradeAbierto, null)} className="w-full rounded border border-dashed border-pitch-700 px-3 py-2 text-left text-sm text-mist">
                  Devolver a la bolsa
                </button>
              </li>
            </ul>
            <button onClick={() => setTradeAbierto(null)} className="mt-4 w-full rounded-pill border border-pitch-700 py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

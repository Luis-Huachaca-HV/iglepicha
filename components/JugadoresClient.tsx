"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { RadarChart } from "@/components/RadarChart";
import type { AsistenciaDraft, Jornada, RolSistema, SesionUsuario } from "@/lib/types";

interface UsuarioLista {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
}

type FiltroEdad = "todos" | "menor18" | "18a29" | "30mas";

const FILTROS: { valor: FiltroEdad; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "menor18", label: "< 18" },
  { valor: "18a29", label: "18–29" },
  { valor: "30mas", label: "30+" },
];

function cumpleFiltro(edad: number | null, filtro: FiltroEdad) {
  if (filtro === "todos") return true;
  if (edad === null) return false;
  if (filtro === "menor18") return edad < 18;
  if (filtro === "18a29") return edad >= 18 && edad <= 29;
  return edad >= 30;
}

export function JugadoresClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [asistencias, setAsistencias] = useState<Record<string, AsistenciaDraft>>({});
  const [valoraciones, setValoraciones] = useState<Record<string, Record<string, number>>>({});
  const [filtro, setFiltro] = useState<FiltroEdad>("todos");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [modalCapitanes, setModalCapitanes] = useState(false);
  const [capitanesElegidos, setCapitanesElegidos] = useState<string[]>([]);
  const [modalNuevoJugador, setModalNuevoJugador] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaEdad, setNuevaEdad] = useState("");
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const puedeMarcarAOtros = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);
  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";

  const cargarAsistencias = useCallback(async (idJornada: string) => {
    const { data } = await supabase.from("asistencia_draft").select("*").eq("id_jornada", idJornada);
    const mapa: Record<string, AsistenciaDraft> = {};
    (data || []).forEach((a) => (mapa[a.id_usuario] = a as AsistenciaDraft));
    setAsistencias(mapa);
  }, []);

  useEffect(() => {
    fetch("/api/jornada/active")
      .then((r) => r.json())
      .then((d) => {
        setJornada(d.jornada);
        if (d.jornada) cargarAsistencias(d.jornada.id_jornada);
      });
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setUsuarios(d.usuarios ?? []));
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
        const promedios: Record<string, Record<string, number>> = {};
        Object.entries(acumulado).forEach(([id, { suma, n }]) => {
          promedios[id] = Object.fromEntries(Object.entries(suma).map(([k, v]) => [k, v / n]));
        });
        setValoraciones(promedios);
      });
  }, [cargarAsistencias]);

  useEffect(() => {
    if (!jornada) return;
    const canal = supabase
      .channel(`jugadores-${jornada.id_jornada}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asistencia_draft", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarAsistencias(jornada.id_jornada)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [jornada?.id_jornada, cargarAsistencias]);

  async function marcar(idUsuario: string, presente: boolean) {
    if (!jornada) return;
    // Optimista: refleja el cambio de inmediato, la suscripción realtime confirma
    setAsistencias((prev) => ({
      ...prev,
      [idUsuario]: { ...(prev[idUsuario] as AsistenciaDraft), id_usuario: idUsuario, id_jornada: jornada.id_jornada, presente } as AsistenciaDraft,
    }));
    await fetch("/api/asistencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, presente }),
    });
  }

  const usuariosFiltrados = useMemo(
    () => usuarios.filter((u) => cumpleFiltro(u.edad, filtro)),
    [usuarios, filtro]
  );

  const presentes = useMemo(() => usuarios.filter((u) => asistencias[u.id_usuario]?.presente), [usuarios, asistencias]);
  const jugadorSeleccionado = usuarios.find((u) => u.id_usuario === seleccionado) ?? null;

  async function crearJugador() {
    if (!nuevoNombre.trim()) {
      setErrorNuevo("Ponle un nombre");
      return;
    }
    setGuardandoNuevo(true);
    setErrorNuevo(null);
    const res = await fetch("/api/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoNombre, edad: nuevaEdad ? Number(nuevaEdad) : undefined }),
    });
    const data = await res.json();
    setGuardandoNuevo(false);
    if (!res.ok) {
      setErrorNuevo(data.error ?? "No se pudo crear");
      return;
    }
    const r = await fetch("/api/usuarios");
    const d = await r.json();
    setUsuarios(d.usuarios ?? []);
    setModalNuevoJugador(false);
    setNuevoNombre("");
    setNuevaEdad("");
  }

  async function confirmarCapitanes() {
    if (!jornada || capitanesElegidos.length < 2) return;
    await fetch("/api/equipos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, capitanes: capitanesElegidos }),
    });
    setModalCapitanes(false);
    setCapitanesElegidos([]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Jugadores</h1>
        <p className="text-sm text-mist">
          {presentes.length} de {usuarios.length} marcados presentes
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-medium transition ${
              filtro === f.valor ? "bg-turf-500 text-pitch-950" : "border border-pitch-700 text-mist"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {esAdmin && (
        <div className="flex gap-2">
          <button
            onClick={() => setModalNuevoJugador(true)}
            className="flex-1 rounded border border-dashed border-turf-500 py-3 text-sm font-medium text-turf-400"
          >
            + Agregar jugador
          </button>
          <button
            onClick={() => setModalCapitanes(true)}
            className="flex-1 rounded border border-dashed border-pitch-700 py-3 text-sm font-medium text-mist"
          >
            Elegir capitanes
          </button>
        </div>
      )}

      <ul className="linea-cancha flex flex-col divide-y divide-pitch-800 pt-2">
        {usuariosFiltrados.map((u) => {
          const presente = !!asistencias[u.id_usuario]?.presente;
          return (
            <li key={u.id_usuario} className="flex items-center justify-between py-3">
              <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setSeleccionado(u.id_usuario)}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pitch-800 font-display text-sm font-bold">
                  {u.nombre.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block text-sm font-medium">{u.nombre}</span>
                  <span className="block text-xs text-mist">{u.edad ? `${u.edad} años` : "Edad no registrada"}</span>
                </span>
              </button>
              <button
                disabled={!puedeMarcarAOtros && sesion.id_usuario !== u.id_usuario}
                onClick={() => marcar(u.id_usuario, !presente)}
                className={`h-7 w-7 rounded border-2 transition ${
                  presente ? "border-turf-500 bg-turf-500" : "border-pitch-700 bg-transparent"
                } disabled:opacity-30`}
                aria-label={presente ? "Marcar ausente" : "Marcar presente"}
              >
                {presente && <span className="block text-sm leading-7 text-pitch-950">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {jugadorSeleccionado && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setSeleccionado(null)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-bold">{jugadorSeleccionado.nombre}</h2>
            <p className="mb-4 text-sm text-mist">
              {jugadorSeleccionado.edad ? `${jugadorSeleccionado.edad} años` : "Edad no registrada"}
            </p>
            <div className="flex justify-center">
              <RadarChart valores={valoraciones[jugadorSeleccionado.id_usuario] ?? null} />
            </div>
            <button onClick={() => setSeleccionado(null)} className="mt-4 w-full rounded-pill border border-pitch-700 py-2.5 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {modalNuevoJugador && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setModalNuevoJugador(false)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-xl font-bold">Agregar jugador</h2>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Nombre
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Ej. Diego Ramírez"
                  className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2 text-chalk"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Edad (opcional)
                <input
                  type="number"
                  min={1}
                  value={nuevaEdad}
                  onChange={(e) => setNuevaEdad(e.target.value)}
                  placeholder="Ej. 27"
                  className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2 text-chalk"
                />
              </label>
            </div>
            {errorNuevo && <p className="mt-2 text-sm text-card-red">{errorNuevo}</p>}
            <p className="mt-3 text-xs text-mist">
              Entra directo por nombre, sin PIN. Si necesita ser admin, capitán o tener PIN, avísame y lo cambiamos
              desde Supabase por ahora.
            </p>
            <button
              onClick={crearJugador}
              disabled={guardandoNuevo}
              className="mt-4 w-full rounded-pill bg-turf-500 py-3 font-display font-bold text-pitch-950 disabled:opacity-50"
            >
              Guardar jugador
            </button>
            <button onClick={() => setModalNuevoJugador(false)} className="mt-2 w-full rounded-pill border border-pitch-700 py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {modalCapitanes && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setModalCapitanes(false)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-bold">Elegir capitanes</h2>
            <p className="mb-4 text-sm text-mist">Toca a los jugadores presentes que serán capitanes de equipo.</p>
            <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {presentes.map((u) => {
                const marcado = capitanesElegidos.includes(u.id_usuario);
                return (
                  <li key={u.id_usuario}>
                    <button
                      onClick={() =>
                        setCapitanesElegidos((prev) =>
                          marcado ? prev.filter((id) => id !== u.id_usuario) : [...prev, u.id_usuario]
                        )
                      }
                      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${
                        marcado ? "bg-turf-700" : "bg-pitch-800"
                      }`}
                    >
                      {u.nombre}
                      {marcado && <span>✓</span>}
                    </button>
                  </li>
                );
              })}
              {presentes.length === 0 && <p className="text-sm text-mist">Nadie marcado presente todavía.</p>}
            </ul>
            <p className="mb-3 text-xs text-mist">{capitanesElegidos.length} equipo(s) se crearán</p>
            <button
              onClick={confirmarCapitanes}
              disabled={capitanesElegidos.length < 2}
              className="w-full rounded-pill bg-turf-500 py-3 font-display font-bold text-pitch-950 disabled:opacity-40"
            >
              Confirmar equipos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

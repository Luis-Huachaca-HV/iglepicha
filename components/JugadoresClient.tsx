"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { RadarChart, ETIQUETAS } from "@/components/RadarChart";
import { Avatar, colorDeEquipo } from "@/components/Avatar";
import { CamoteToggle } from "@/components/CamoteToggle";
import { Toast } from "@/components/Toast";
import { useUsuarios } from "@/lib/useUsuarios";
import { useToast } from "@/lib/useToast";
import type { AsistenciaDraft, EquipoJornada, Jornada, Posicion, SesionUsuario } from "@/lib/types";

const POSICIONES: Posicion[] = ["POR", "DEF", "MC", "DEL"];
const LIMITE_TITULARES = 30;

const CHIPS_POSICION: { id: string; label: string; guarda: Posicion }[] = [
  { id: "POR", label: "Portero", guarda: "POR" },
  { id: "DEF", label: "Defensa", guarda: "DEF" },
  { id: "LAT", label: "Lateral", guarda: "DEF" },
  { id: "MED", label: "Medio", guarda: "MC" },
  { id: "DEL", label: "Delantero", guarda: "DEL" },
];

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

  useEffect(() => {
    const canalNuevaJornada = supabase
      .channel(`jornada-nueva-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jornadas" }, () => cargarJornada())
      .subscribe();
    return () => {
      supabase.removeChannel(canalNuevaJornada);
    };
  }, []);

  const { usuarios, recargarUsuarios } = useUsuarios();
  const [equipos, setEquipos] = useState<EquipoJornada[]>([]);
  const [asistencias, setAsistencias] = useState<Record<string, AsistenciaDraft>>({});
  const [valoraciones, setValoraciones] = useState<Record<string, Record<string, number>>>({});
  const [filtro, setFiltro] = useState<FiltroEdad>("todos");
  const [filtroPosicion, setFiltroPosicion] = useState<string>("todas");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [modalCapitanes, setModalCapitanes] = useState(false);
  const [capitanesElegidos, setCapitanesElegidos] = useState<string[]>([]);
  const [modalNuevoJugador, setModalNuevoJugador] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaEdad, setNuevaEdad] = useState("");
  const [nuevoCamote, setNuevoCamote] = useState(false);
  const [nuevoInvitado, setNuevoInvitado] = useState(false);
  const [pasoNuevo, setPasoNuevo] = useState<1 | 2 | 3>(1);
  const [chipsNuevo, setChipsNuevo] = useState<string[]>([]);
  const [valoracionNueva, setValoracionNueva] = useState(6);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const { mensaje: mensajeToast, mostrarToast } = useToast();
  const [editandoValoracion, setEditandoValoracion] = useState(false);
  const [statsEdit, setStatsEdit] = useState<Record<string, number>>({});
  const [confirmarAsistencia, setConfirmarAsistencia] = useState<{ id_usuario: string; nombre: string; presente: boolean } | null>(null);

  // Estados para 6to equipo de suplentes (al llegar a 35 o 36)
  const [popup35Abierto, setPopup35Abierto] = useState(false);
  const [aviso35Descartado, setAviso35Descartado] = useState(false);
  const [modalSextoEquipo, setModalSextoEquipo] = useState(false);
  const [capitanSextoElegido, setCapitanSextoElegido] = useState<string | null>(null);
  const [creandoSexto, setCreandoSexto] = useState(false);

  const puedeMarcarAOtros = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);
  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";
  const esCapitan = sesion.rol_sistema === "capitan";
  const jornadaBloqueada = !!jornada && jornada.estado !== "pendiente";
  const miEquipo = equipos.find((e) => e.id_capitan === sesion.id_usuario) ?? null;

  const cargarAsistenciasYEquipos = useCallback(async (idJornada: string) => {
    const [{ data: asis }, { data: eq }] = await Promise.all([
      supabase.from("asistencia_draft").select("*").eq("id_jornada", idJornada),
      supabase.from("equipos_jornada").select("*").eq("id_jornada", idJornada),
    ]);
    const mapa: Record<string, AsistenciaDraft> = {};
    (asis || []).forEach((a) => (mapa[a.id_usuario] = a as AsistenciaDraft));
    setAsistencias(mapa);
    setEquipos((eq as EquipoJornada[]) || []);
  }, []);

  const cargarJornada = useCallback(async () => {
    try {
      const r = await fetch("/api/jornada/active", { cache: "no-store" });
      if (!r.ok) return null;
      const d = await r.json();
      if (!d?.jornada) return null;
      setJornada(d.jornada);
      cargarAsistenciasYEquipos(d.jornada.id_jornada);
      return d.jornada as Jornada;
    } catch {
      return null;
    }
  }, [cargarAsistenciasYEquipos]);

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
        const promedios: Record<string, Record<string, number>> = {};
        Object.entries(acumulado).forEach(([id, { suma, n }]) => {
          promedios[id] = Object.fromEntries(Object.entries(suma).map(([k, v]) => [k, v / n]));
        });
        setValoraciones(promedios);
      });
  }, [cargarJornada]);

  useEffect(() => {
    const id = setInterval(cargarJornada, 5000);
    function alVolver() {
      if (document.visibilityState === "visible") cargarJornada();
    }
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
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
      .channel(`jugadores-${jornada.id_jornada}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asistencia_draft", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarAsistenciasYEquipos(jornada.id_jornada)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos_jornada", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarAsistenciasYEquipos(jornada.id_jornada)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [jornada?.id_jornada, cargarAsistenciasYEquipos]);

  // Clasificación en vivo: primeros 30 no-Camotes = Titulares; 31+ = Suplentes (salvo Invitados o Capitanes)
  const capitanesSet = useMemo(
    () => new Set(equipos.map((e) => e.id_capitan).filter((id): id is string => Boolean(id))),
    [equipos]
  );

  const clasificacion = useMemo(() => {
    const camotes = new Set<string>();
    const noCamotesPresentes: { id_usuario: string; marcado_en?: string | null; id_asistencia?: string; es_invitado?: boolean }[] = [];

    for (const u of usuarios) {
      const a = asistencias[u.id_usuario];
      if (!a?.presente) continue;
      if (u.es_camote && typeof u.edad === "number" && u.edad < 12) {
        camotes.add(u.id_usuario);
      } else {
        noCamotesPresentes.push({
          id_usuario: u.id_usuario,
          marcado_en: a.marcado_en,
          id_asistencia: a.id_asistencia,
          es_invitado: a.es_invitado,
        });
      }
    }

    noCamotesPresentes.sort((a, b) => {
      const tA = a.marcado_en ? Date.parse(a.marcado_en) : Number.MAX_SAFE_INTEGER;
      const tB = b.marcado_en ? Date.parse(b.marcado_en) : Number.MAX_SAFE_INTEGER;
      if (tA !== tB) return tA - tB;
      return String(a.id_asistencia ?? a.id_usuario).localeCompare(String(b.id_asistencia ?? b.id_usuario));
    });

    const ordenPorId = new Map<string, number>();
    const titulares = new Set<string>();
    const suplentes = new Set<string>();
    const invitados = new Set<string>();

    noCamotesPresentes.forEach((item, idx) => {
      const orden = idx + 1;
      ordenPorId.set(item.id_usuario, orden);
      if (item.es_invitado) invitados.add(item.id_usuario);
      if (orden <= LIMITE_TITULARES || item.es_invitado || capitanesSet.has(item.id_usuario)) {
        titulares.add(item.id_usuario);
      } else {
        suplentes.add(item.id_usuario);
      }
    });

    return {
      camotes,
      titulares,
      suplentes,
      invitados,
      ordenPorId,
      totalNoCamotes: noCamotesPresentes.length,
    };
  }, [usuarios, asistencias, capitanesSet]);

  const suplentesSinEquipo = useMemo(
    () =>
      usuarios.filter(
        (u) => clasificacion.suplentes.has(u.id_usuario) && !asistencias[u.id_usuario]?.id_equipo
      ),
    [usuarios, clasificacion.suplentes, asistencias]
  );

  // Disparo automático de pop-up al llegar a 35 (5 suplentes, pregunta opcional) o 36 (6 suplentes, directo)
  useEffect(() => {
    if (!esAdmin || jornadaBloqueada || equipos.length >= 6) return;
    if (suplentesSinEquipo.length >= 6) {
      setPopup35Abierto(false);
      setModalSextoEquipo(true);
    } else if (suplentesSinEquipo.length === 5 && !aviso35Descartado && !modalSextoEquipo) {
      setPopup35Abierto(true);
    } else if (suplentesSinEquipo.length < 5) {
      setPopup35Abierto(false);
      setAviso35Descartado(false);
    }
  }, [esAdmin, jornadaBloqueada, equipos.length, suplentesSinEquipo.length, aviso35Descartado, modalSextoEquipo]);

  async function marcar(idUsuario: string, presente: boolean) {
    if (!jornada) return;
    const anterior = asistencias[idUsuario];
    setAsistencias((prev) => ({
      ...prev,
      [idUsuario]: {
        ...(prev[idUsuario] as AsistenciaDraft),
        id_usuario: idUsuario,
        id_jornada: jornada.id_jornada,
        presente,
        marcado_en: presente ? new Date().toISOString() : null,
      } as AsistenciaDraft,
    }));

    const intentar = (idJornada: string) =>
      fetch("/api/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_jornada: idJornada, id_usuario: idUsuario, presente }),
      });

    let res = await intentar(jornada.id_jornada);
    let data = await res.json().catch(() => ({}));

    for (let intento = 0; !res.ok && data?.jornadaInvalida && intento < 2; intento++) {
      if (intento === 1) await new Promise((r) => setTimeout(r, 400));
      const fresca = await cargarJornada();
      if (!fresca) break;
      res = await intentar(fresca.id_jornada);
      data = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      setAsistencias((prev) => ({ ...prev, [idUsuario]: anterior as AsistenciaDraft }));
      mostrarToast(data?.error ?? "No se pudo actualizar la asistencia");
    } else {
      cargarAsistenciasYEquipos(jornada.id_jornada);
      if (data?.advertencia) mostrarToast(data.advertencia);
    }
  }

  async function toggleInvitado(idUsuario: string, nuevoEstado: boolean) {
    if (!jornada) return;
    const res = await fetch("/api/asistencia/invitado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, es_invitado: nuevoEstado }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarToast(data?.error ?? "No se pudo actualizar condición de invitado");
    } else {
      cargarAsistenciasYEquipos(jornada.id_jornada);
      mostrarToast(nuevoEstado ? "✓ Marcado como Invitado por esta jornada" : "✓ Quitado privilegio de invitado");
    }
  }

  async function crearSextoEquipo() {
    if (!jornada || !capitanSextoElegido || suplentesSinEquipo.length < 5) return;
    setCreandoSexto(true);
    const res = await fetch("/api/equipos/sexto-equipo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_jornada: jornada.id_jornada,
        id_capitan: capitanSextoElegido,
        ids_suplentes: suplentesSinEquipo.map((u) => u.id_usuario),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCreandoSexto(false);
    if (!res.ok) {
      mostrarToast(data?.error ?? "No se pudo crear el 6to equipo");
      return;
    }
    setModalSextoEquipo(false);
    setCapitanSextoElegido(null);
    cargarAsistenciasYEquipos(jornada.id_jornada);
    recargarUsuarios();
    mostrarToast("✓ ¡6to equipo de suplentes creado!");
  }

  async function asignarEquipo(idUsuario: string, idEquipo: string | null) {
    if (!jornada) return;
    await fetch("/api/asistencia/asignar-equipo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, id_equipo: idEquipo }),
    });
    cargarAsistenciasYEquipos(jornada.id_jornada);
  }

  const usuariosFiltrados = useMemo(
    () =>
      usuarios.filter((u) => {
        if (!cumpleFiltro(u.edad, filtro)) return false;
        if (filtroPosicion === "todas") return true;
        if (filtroPosicion === "MED") return u.posicion === "MC";
        if (filtroPosicion === "LAT") return u.posicion === "DEF";
        return u.posicion === filtroPosicion;
      }),
    [usuarios, filtro, filtroPosicion]
  );

  const presentes = useMemo(() => usuarios.filter((u) => asistencias[u.id_usuario]?.presente), [usuarios, asistencias]);
  const jugadorSeleccionado = usuarios.find((u) => u.id_usuario === seleccionado) ?? null;

  function nombreEquipo(idEquipo: string | null | undefined) {
    if (!idEquipo) return "Sin equipo";
    const e = equipos.find((eq) => eq.id_equipo === idEquipo);
    if (!e) return "Sin equipo";
    return `Equipo de ${usuarios.find((u) => u.id_usuario === e.id_capitan)?.nombre ?? "?"}`;
  }

  async function asignarPosicion(idUsuario: string, posicion: string) {
    await fetch("/api/usuarios/posicion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_usuario: idUsuario, posicion }),
    });
    recargarUsuarios();
  }

  function abrirEditorValoracion(idUsuario: string) {
    const base = valoraciones[idUsuario] ?? {};
    const inicial: Record<string, number> = {};
    ETIQUETAS.forEach((e) => (inicial[e.clave] = Math.round(base[e.clave] ?? 5)));
    setStatsEdit(inicial);
    setEditandoValoracion(true);
  }

  async function guardarValoracion(idUsuario: string) {
    await fetch("/api/valoraciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_evaluado: idUsuario, stats: statsEdit }),
    });
    setEditandoValoracion(false);
    mostrarToast("✓ Valoración guardada");
    if (jornada) {
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
    }
  }

  async function crearJugador() {
    if (!nuevoNombre.trim()) {
      setErrorNuevo("Ponle un nombre");
      return;
    }
    setGuardandoNuevo(true);
    setErrorNuevo(null);
    const edadNum = nuevaEdad ? Number(nuevaEdad) : undefined;
    const res = await fetch("/api/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoNombre, edad: edadNum }),
    });
    const data = await res.json();
    setGuardandoNuevo(false);
    if (!res.ok) {
      setErrorNuevo(data.error ?? "No se pudo crear");
      return;
    }
    const idNuevo = data.usuario?.id_usuario as string | undefined;
    const chip = CHIPS_POSICION.find((c) => c.id === chipsNuevo[0]);
    if (idNuevo && chip) {
      await fetch("/api/usuarios/posicion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: idNuevo, posicion: chip.guarda }),
      });
    }
    if (idNuevo && nuevoCamote && typeof edadNum === "number" && edadNum < 12) {
      await fetch("/api/usuarios/camote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: idNuevo, es_camote: true }),
      });
    }
    if (idNuevo && nuevoInvitado && jornada) {
      await fetch("/api/asistencia/invitado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idNuevo, es_invitado: true }),
      });
      cargarAsistenciasYEquipos(jornada.id_jornada);
    }
    if (idNuevo && idNuevo !== sesion.id_usuario) {
      const stats = Object.fromEntries(ETIQUETAS.map((e) => [e.clave, valoracionNueva]));
      await fetch("/api/valoraciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_evaluado: idNuevo, stats }),
      });
    }
    recargarUsuarios();
    setModalNuevoJugador(false);
    setNuevoNombre("");
    setNuevaEdad("");
    setNuevoCamote(false);
    setNuevoInvitado(false);
    setPasoNuevo(1);
    setChipsNuevo([]);
    setValoracionNueva(6);
    mostrarToast(`✓ ${data.usuario?.nombre ?? "Jugador"} agregado`);
  }

  async function marcarTicket(idUsuario: string, ticket: boolean) {
    if (!jornada) return;
    const anterior = asistencias[idUsuario];
    setAsistencias((prev) => ({
      ...prev,
      [idUsuario]: {
        ...(prev[idUsuario] as AsistenciaDraft),
        id_usuario: idUsuario,
        id_jornada: jornada.id_jornada,
        ticket_adicional: ticket,
      } as AsistenciaDraft,
    }));
    const res = await fetch("/api/asistencia/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, ticket_adicional: ticket }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAsistencias((prev) => ({ ...prev, [idUsuario]: anterior as AsistenciaDraft }));
      mostrarToast(data?.error ?? "No se pudo marcar el ticket");
    }
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

  const lista30Cerrada = clasificacion.totalNoCamotes >= LIMITE_TITULARES;

  return (
    <div className="flex flex-col gap-6">
      <Toast mensaje={mensajeToast} />

      <div>
        <h1 className="font-display text-2xl font-bold">Jugadores</h1>
        <p className="text-sm text-mist">
          {clasificacion.titulares.size}/{LIMITE_TITULARES} titulares
          {clasificacion.suplentes.size > 0 ? ` · ${clasificacion.suplentes.size} suplente(s)` : ""}
          {clasificacion.camotes.size > 0 ? ` · ${clasificacion.camotes.size} camote(s)` : ""}
        </p>
      </div>

      {lista30Cerrada && (
        <div className="rounded border border-floodlight/40 bg-floodlight/10 px-4 py-3 text-xs text-floodlight">
          ⚡ <strong>30 titulares completos.</strong> Los siguientes asistentes ingresan con tono opaco como{" "}
          <strong>Suplentes</strong> (salvo que tengan check de <strong>Invitado</strong>). Igual puedes quitar o marcar asistencias normalmente.
        </div>
      )}

      {esAdmin && !jornadaBloqueada && suplentesSinEquipo.length >= 5 && equipos.length < 6 && (
        <button
          onClick={() => setModalSextoEquipo(true)}
          className="w-full rounded-pill bg-floodlight py-3 font-display text-sm font-bold text-pitch-950"
        >
          ⚽ Armar 6to equipo con los {suplentesSinEquipo.length} suplentes
        </button>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {[{ id: "todas", label: "Posición" }, ...CHIPS_POSICION.map((c) => ({ id: c.id, label: c.label }))].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroPosicion(filtroPosicion === f.id ? "todas" : f.id)}
            className={`whitespace-nowrap rounded-pill px-3 py-2 text-xs font-medium ${
              filtroPosicion === f.id ? "bg-floodlight text-pitch-950" : "border border-pitch-700 text-mist"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`whitespace-nowrap rounded-pill px-3 py-2 text-xs font-medium transition ${
              filtro === f.valor ? "bg-turf-500 text-pitch-950" : "border border-pitch-700 text-mist"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {jornadaBloqueada && (
        <div className="rounded border border-dashed border-pitch-700 bg-pitch-900 px-4 py-3 text-center text-sm text-mist">
          🔒 Asistencia y equipos bloqueados — la jornada ya empezó o finalizó.
        </div>
      )}

      {esAdmin && !jornadaBloqueada && (
        <div className="flex gap-2">
          <button
            onClick={() => setModalNuevoJugador(true)}
            className="flex-1 rounded border border-dashed border-turf-500 py-3.5 text-sm font-medium text-turf-400"
          >
            + Agregar jugador
          </button>
          <button
            onClick={() => setModalCapitanes(true)}
            className="flex-1 rounded border border-dashed border-pitch-700 py-3.5 text-sm font-medium text-mist"
          >
            Elegir capitanes
          </button>
        </div>
      )}

      <ul className="linea-cancha flex flex-col divide-y divide-pitch-800 pt-2">
        {usuariosFiltrados.map((u) => {
          const asis = asistencias[u.id_usuario];
          const presente = !!asis?.presente;
          const enEquipo = !!asis?.id_equipo;
          const bloqueadoQuitar = presente && enEquipo;
          const esCamote = Boolean(u.es_camote && typeof u.edad === "number" && u.edad < 12);
          const esInvitado = Boolean(asis?.es_invitado);
          const esSuplente = clasificacion.suplentes.has(u.id_usuario);
          const ordenLlegada = clasificacion.ordenPorId.get(u.id_usuario);
          const mostrarOpaco = esSuplente || (!presente && lista30Cerrada && !esCamote && !esInvitado);

          return (
            <li
              key={u.id_usuario}
              className={`flex items-center justify-between gap-2 py-2 transition-opacity ${
                mostrarOpaco ? "opacity-60" : "opacity-100"
              }`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
                onClick={() => {
                  setSeleccionado(u.id_usuario);
                  setEditandoValoracion(false);
                }}
              >
                <Avatar
                  nombre={u.nombre}
                  color={
                    equipos.findIndex((e) => e.id_equipo === asis?.id_equipo) >= 0
                      ? colorDeEquipo(equipos.findIndex((e) => e.id_equipo === asis?.id_equipo))
                      : "#334155"
                  }
                  anillo={presente ? "asistencia" : undefined}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {u.nombre}
                    {ordenLlegada && !esCamote && (
                      <span className="ml-1.5 text-xs text-mist">#{ordenLlegada}</span>
                    )}
                    {esCamote && (
                      <span className="ml-2 rounded-pill bg-floodlight/15 px-2 py-0.5 text-xs font-bold text-floodlight">
                        Camote
                      </span>
                    )}
                    {esInvitado && (
                      <span className="ml-2 rounded-pill bg-turf-500/20 px-2 py-0.5 text-xs font-bold text-turf-400">
                        Invitado
                      </span>
                    )}
                    {esSuplente && (
                      <span className="ml-2 rounded-pill bg-pitch-700 px-2 py-0.5 text-xs font-bold text-mist">
                        Suplente
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-mist">
                    {u.edad ? `${u.edad} años` : "Edad no registrada"}
                    {u.posicion ? ` · ${u.posicion}` : ""} · {nombreEquipo(asis?.id_equipo)}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 gap-1.5">
                <button
                  disabled={jornadaBloqueada || (!puedeMarcarAOtros && sesion.id_usuario !== u.id_usuario) || bloqueadoQuitar}
                  onClick={() =>
                    setConfirmarAsistencia({ id_usuario: u.id_usuario, nombre: u.nombre, presente: !presente })
                  }
                  title="Asistencia"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                    presente
                      ? esSuplente
                        ? "border-floodlight/50 bg-floodlight/40 text-pitch-950"
                        : "border-floodlight bg-floodlight text-pitch-950"
                      : "border-pitch-700 bg-transparent text-mist"
                  } disabled:opacity-60`}
                  aria-label={presente ? "Marcar ausente" : "Marcar presente"}
                >
                  {presente ? (bloqueadoQuitar ? "🔒" : "✓") : ""}
                </button>
                <button
                  disabled={jornadaBloqueada || (!puedeMarcarAOtros && sesion.id_usuario !== u.id_usuario)}
                  onClick={() => marcarTicket(u.id_usuario, !asis?.ticket_adicional)}
                  title="Ticket"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                    asis?.ticket_adicional
                      ? "border-turf-400 bg-turf-500 text-pitch-950"
                      : "border-pitch-700 bg-transparent text-mist"
                  } disabled:opacity-60`}
                  aria-label="Ticket adicional"
                >
                  {asis?.ticket_adicional ? "✓" : ""}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {jugadorSeleccionado && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => { setSeleccionado(null); setEditandoValoracion(false); }}>
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold">{jugadorSeleccionado.nombre}</h2>
            <p className="mb-4 text-sm text-mist">
              {jugadorSeleccionado.edad ? `${jugadorSeleccionado.edad} años` : "Edad no registrada"}
              {jugadorSeleccionado.posicion ? ` · ${jugadorSeleccionado.posicion}` : ""}
            </p>

            {esAdmin && (
              <CamoteToggle
                idUsuario={jugadorSeleccionado.id_usuario}
                edad={jugadorSeleccionado.edad}
                esCamote={Boolean(jugadorSeleccionado.es_camote)}
                onChanged={() => {
                  recargarUsuarios();
                  mostrarToast("✓ Estado Camote actualizado");
                }}
                onError={(msg) => mostrarToast(msg)}
              />
            )}

            {esAdmin && !jornadaBloqueada && (
              <label className="mb-4 flex cursor-pointer items-center justify-between rounded border border-turf-500/40 bg-turf-500/10 px-3 py-2.5">
                <div>
                  <span className="block text-sm font-bold text-turf-400">Invitado (solo por esta jornada)</span>
                  <span className="block text-xs text-mist">
                    Si llega después de los 30, entra como titular en vez de suplente.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(asistencias[jugadorSeleccionado.id_usuario]?.es_invitado)}
                  onChange={(e) => toggleInvitado(jugadorSeleccionado.id_usuario, e.target.checked)}
                  className="h-5 w-5 accent-turf-500"
                />
              </label>
            )}

            {esAdmin && (
              <div className="mb-4 flex gap-2">
                {POSICIONES.map((p) => (
                  <button
                    key={p}
                    onClick={() => asignarPosicion(jugadorSeleccionado.id_usuario, p)}
                    className={`flex-1 rounded-pill py-2 text-xs font-bold ${
                      jugadorSeleccionado.posicion === p ? "bg-turf-500 text-pitch-950" : "border border-pitch-700 text-mist"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-center">
              <RadarChart valores={valoraciones[jugadorSeleccionado.id_usuario] ?? null} />
            </div>

            {(esAdmin || esCapitan) && !editandoValoracion && (
              <button
                onClick={() => abrirEditorValoracion(jugadorSeleccionado.id_usuario)}
                className="mt-3 w-full rounded-pill border border-dashed border-turf-500 py-2.5 text-sm text-turf-400"
              >
                {valoraciones[jugadorSeleccionado.id_usuario] ? "Editar valoración" : "Poner valoración"}
              </button>
            )}

            {editandoValoracion && (
              <div className="mt-3 flex flex-col gap-2 rounded border border-pitch-800 bg-pitch-950 p-3">
                {ETIQUETAS.map((atributo) => (
                  <label key={atributo.clave} className="flex items-center justify-between text-sm">
                    {atributo.label}
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={statsEdit[atributo.clave] ?? 5}
                      onChange={(e) =>
                        setStatsEdit((prev) => ({ ...prev, [atributo.clave]: Number(e.target.value) }))
                      }
                      className="w-16 rounded border border-pitch-700 bg-pitch-900 px-2 py-1.5 text-center"
                    />
                  </label>
                ))}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setEditandoValoracion(false)}
                    className="flex-1 rounded-pill border border-pitch-700 py-2.5 text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => guardarValoracion(jugadorSeleccionado.id_usuario)}
                    className="flex-1 rounded-pill bg-turf-500 py-2.5 text-sm font-bold text-pitch-950"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {(esAdmin || esCapitan) && !jornadaBloqueada && (
              <div className="mt-4 border-t border-pitch-800 pt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-mist">
                  Equipo actual: {nombreEquipo(asistencias[jugadorSeleccionado.id_usuario]?.id_equipo)}
                </p>
                <div className="flex flex-col gap-2">
                  {esAdmin &&
                    equipos.map((e) => (
                      <button
                        key={e.id_equipo}
                        onClick={() => asignarEquipo(jugadorSeleccionado.id_usuario, e.id_equipo)}
                        className="rounded bg-pitch-800 px-3 py-2.5 text-left text-sm"
                      >
                        Poner en {nombreEquipo(e.id_equipo)}
                      </button>
                    ))}
                  {esCapitan && miEquipo && (
                    <button
                      onClick={() => asignarEquipo(jugadorSeleccionado.id_usuario, miEquipo.id_equipo)}
                      className="rounded bg-pitch-800 px-3 py-2.5 text-left text-sm"
                    >
                      Poner en mi equipo
                    </button>
                  )}
                  {asistencias[jugadorSeleccionado.id_usuario]?.id_equipo && (esAdmin || esCapitan) && (
                    <button
                      onClick={() => asignarEquipo(jugadorSeleccionado.id_usuario, null)}
                      className="rounded border border-dashed border-pitch-700 px-3 py-2.5 text-left text-sm text-mist"
                    >
                      Quitar de su equipo
                    </button>
                  )}
                </div>
              </div>
            )}

            <button onClick={() => { setSeleccionado(null); setEditandoValoracion(false); }} className="mt-4 w-full rounded-pill border border-pitch-700 py-3 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {modalNuevoJugador && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setModalNuevoJugador(false)}>
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-display text-xl font-bold">Agregar jugador</h2>
            <p className="mb-4 text-xs text-mist">Paso {pasoNuevo} de 3</p>
            {pasoNuevo === 1 && (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Nombre
                  <input
                    type="text"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="Ej. Diego Ramírez"
                    className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-base text-chalk"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Edad (opcional)
                  <input
                    type="number"
                    min={1}
                    value={nuevaEdad}
                    onChange={(e) => {
                      setNuevaEdad(e.target.value);
                      if (!e.target.value || Number(e.target.value) >= 12) setNuevoCamote(false);
                    }}
                    placeholder="Ej. 27"
                    className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-base text-chalk"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded border border-turf-500/40 bg-turf-500/10 px-3 py-2.5">
                  <div>
                    <span className="block text-sm font-bold text-turf-400">Es invitado (solo esta jornada)</span>
                    <span className="block text-xs text-mist">
                      Se salta la regla de suplente si llega después de los 30 titulares.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={nuevoInvitado}
                    onChange={(e) => setNuevoInvitado(e.target.checked)}
                    className="h-5 w-5 accent-turf-500"
                  />
                </label>
                {nuevaEdad && Number(nuevaEdad) > 0 && Number(nuevaEdad) < 12 && (
                  <label className="flex cursor-pointer items-center justify-between rounded border border-floodlight/40 bg-floodlight/10 px-3 py-2.5">
                    <div>
                      <span className="block text-sm font-bold text-floodlight">Camote (menor de 12)</span>
                      <span className="block text-xs text-mist">No ocupa cupo titular en el draft; entra por sorteo al final.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={nuevoCamote}
                      onChange={(e) => setNuevoCamote(e.target.checked)}
                      className="h-5 w-5 accent-floodlight"
                    />
                  </label>
                )}
              </div>
            )}
            {pasoNuevo === 2 && (
              <div className="flex flex-wrap gap-2">
                {CHIPS_POSICION.map((chip) => {
                  const activo = chipsNuevo.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      onClick={() =>
                        setChipsNuevo((prev) => (activo ? prev.filter((id) => id !== chip.id) : [...prev, chip.id]))
                      }
                      className={`rounded-pill px-3 py-2 text-sm font-medium ${
                        activo ? "bg-turf-500 text-pitch-950" : "border border-pitch-700 text-mist"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            )}
            {pasoNuevo === 3 && (
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setValoracionNueva((v) => Math.max(1, Math.round((v - 0.5) * 10) / 10))}
                  className="h-12 w-12 rounded-full border border-pitch-700 text-xl"
                >
                  −
                </button>
                <span className="font-display text-4xl font-bold text-turf-400">{valoracionNueva.toFixed(1)}</span>
                <button
                  onClick={() => setValoracionNueva((v) => Math.min(10, Math.round((v + 0.5) * 10) / 10))}
                  className="h-12 w-12 rounded-full border border-pitch-700 text-xl"
                >
                  +
                </button>
              </div>
            )}
            {errorNuevo && <p className="mt-2 text-sm text-card-red">{errorNuevo}</p>}
            <div className="mt-4 flex gap-2">
              {pasoNuevo > 1 && (
                <button onClick={() => setPasoNuevo((p) => (p - 1) as 1 | 2 | 3)} className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm">
                  Atrás
                </button>
              )}
              {pasoNuevo < 3 ? (
                <button
                  onClick={() => {
                    if (pasoNuevo === 1 && !nuevoNombre.trim()) {
                      setErrorNuevo("Ponle un nombre");
                      return;
                    }
                    setErrorNuevo(null);
                    setPasoNuevo((p) => (p + 1) as 2 | 3);
                  }}
                  className="flex-1 rounded-pill bg-turf-500 py-3 font-bold text-pitch-950"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  onClick={crearJugador}
                  disabled={guardandoNuevo}
                  className="flex-1 rounded-pill bg-turf-500 py-3 font-display font-bold text-pitch-950 disabled:opacity-50"
                >
                  Guardar jugador
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setModalNuevoJugador(false);
                setPasoNuevo(1);
              }}
              className="mt-2 w-full rounded-pill border border-pitch-700 py-3 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {modalCapitanes && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setModalCapitanes(false)}>
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-pitch-700 bg-pitch-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold">Elegir capitanes</h2>
            <p className="mb-4 text-sm text-mist">Toca a los jugadores titulares presentes que serán capitanes.</p>
            <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {presentes
                .filter((u) => clasificacion.titulares.has(u.id_usuario))
                .map((u) => {
                  const marcado = capitanesElegidos.includes(u.id_usuario);
                  return (
                    <li key={u.id_usuario}>
                      <button
                        onClick={() =>
                          setCapitanesElegidos((prev) =>
                            marcado ? prev.filter((id) => id !== u.id_usuario) : [...prev, u.id_usuario]
                          )
                        }
                        className={`flex w-full items-center justify-between rounded px-3 py-3 text-sm ${
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
              className="w-full rounded-pill bg-turf-500 py-3.5 font-display font-bold text-pitch-950 disabled:opacity-40"
            >
              Confirmar equipos
            </button>
          </div>
        </div>
      )}

      {/* Pop-up automático al llegar a 35 jugadores (5 suplentes) */}
      {popup35Abierto && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-floodlight bg-pitch-900 p-6 text-center">
            <p className="font-display text-xl font-bold text-floodlight">⚽ ¡35 jugadores presentes!</p>
            <p className="mb-6 mt-2 text-sm text-mist">
              Ya tienes 30 titulares y 5 suplentes. ¿Deseas pasar a crear el 6to equipo ahora mismo con estos 5 suplentes o esperar al jugador 36?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPopup35Abierto(false);
                  setAviso35Descartado(true);
                }}
                className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm"
              >
                Esperar al 36
              </button>
              <button
                onClick={() => {
                  setPopup35Abierto(false);
                  setModalSextoEquipo(true);
                }}
                className="flex-1 rounded-pill bg-floodlight py-3 text-sm font-bold text-pitch-950"
              >
                Crear 6to equipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para elegir al capitán del 6to equipo entre los suplentes */}
      {modalSextoEquipo && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-pitch-950/80 backdrop-blur-sm" onClick={() => setModalSextoEquipo(false)}>
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-floodlight bg-pitch-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold text-floodlight">6to Equipo (Suplentes)</h2>
            <p className="mb-4 text-sm text-mist">
              Elige quién será el capitán entre los {suplentesSinEquipo.length} suplentes para armar el equipo #6:
            </p>
            <ul className="mb-4 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {suplentesSinEquipo.map((u) => {
                const elegido = capitanSextoElegido === u.id_usuario;
                return (
                  <li key={u.id_usuario}>
                    <button
                      onClick={() => setCapitanSextoElegido(u.id_usuario)}
                      className={`flex w-full items-center justify-between rounded px-3 py-3 text-sm font-medium ${
                        elegido ? "bg-floodlight text-pitch-950 font-bold" : "bg-pitch-800 text-chalk"
                      }`}
                    >
                      <span>{u.nombre}</span>
                      {elegido && <span>★ Capitán</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => setModalSextoEquipo(false)}
                className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={crearSextoEquipo}
                disabled={!capitanSextoElegido || creandoSexto}
                className="flex-1 rounded-pill bg-floodlight py-3 font-display font-bold text-pitch-950 disabled:opacity-40"
              >
                Confirmar 6to equipo
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarAsistencia && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm"
          onClick={() => setConfirmarAsistencia(null)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-pitch-700 bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm text-mist">
              {confirmarAsistencia.presente ? "¿Confirmas que llegó" : "¿Quitar la asistencia de"}
            </p>
            <p className="mb-6 font-display text-xl font-bold">{confirmarAsistencia.nombre}?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarAsistencia(null)} className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => {
                  marcar(confirmarAsistencia.id_usuario, confirmarAsistencia.presente);
                  setConfirmarAsistencia(null);
                }}
                className="flex-1 rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

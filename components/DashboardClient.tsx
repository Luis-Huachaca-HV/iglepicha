"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CountdownTimer } from "@/components/CountdownTimer";
import type { Jornada, SesionUsuario } from "@/lib/types";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Por iniciar",
  en_curso: "En curso",
  finalizada: "Finalizada",
};

export function DashboardClient({ sesion }: { sesion: SesionUsuario }) {
  const router = useRouter();
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [presentes, setPresentes] = useState(0);
  const [equipos, setEquipos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";

  const cargarConteos = useCallback(async (idJornada: string) => {
    const [{ count: countPresentes }, { count: countEquipos }] = await Promise.all([
      supabase
        .from("asistencia_draft")
        .select("*", { count: "exact", head: true })
        .eq("id_jornada", idJornada)
        .eq("presente", true),
      supabase.from("equipos_jornada").select("*", { count: "exact", head: true }).eq("id_jornada", idJornada),
    ]);
    setPresentes(countPresentes ?? 0);
    setEquipos(countEquipos ?? 0);
  }, []);

  const cargarJornadaActiva = useCallback(async () => {
    const r = await fetch("/api/jornada/active", { cache: "no-store" });
    const d = await r.json();
    setJornada(d.jornada);
    if (d.jornada) cargarConteos(d.jornada.id_jornada);
    return d.jornada as Jornada | null;
  }, [cargarConteos]);

  useEffect(() => {
    cargarJornadaActiva();
  }, [cargarJornadaActiva]);

  // Red de seguridad extra: si vuelves a esta pantalla después de estar en
  // segundo plano (cambiaste de app, volviste del bloqueo de pantalla,
  // etc.), vuelve a consultar el estado real en vez de confiar en lo que
  // quedó en memoria.
  useEffect(() => {
    function alVolverAEnfocar() {
      if (document.visibilityState === "visible") cargarJornadaActiva();
    }
    document.addEventListener("visibilitychange", alVolverAEnfocar);
    window.addEventListener("focus", alVolverAEnfocar);
    return () => {
      document.removeEventListener("visibilitychange", alVolverAEnfocar);
      window.removeEventListener("focus", alVolverAEnfocar);
    };
  }, [cargarJornadaActiva]);

  useEffect(() => {
    if (!jornada) return;
    const canal = supabase
      .channel(`dashboard-${jornada.id_jornada}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asistencia_draft", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarConteos(jornada.id_jornada)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos_jornada", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarConteos(jornada.id_jornada)
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
  }, [jornada?.id_jornada, cargarConteos]);

  async function cambiarEstado(accion: "iniciar" | "finalizar") {
    if (!jornada) return;
    setCargando(true);
    setError(null);
    const res = await fetch("/api/jornada/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, accion }),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      setCargando(false);
      setError(data.error ?? "No se pudo actualizar la jornada. Inténtalo de nuevo.");
      return;
    }
    // Confirma contra la base de datos (no solo contra la respuesta del
    // POST) y refresca el árbol de Next para invalidar cualquier caché de
    // navegación al volver a esta pantalla.
    await cargarJornadaActiva();
    router.refresh();
    setCargando(false);
  }

  async function nuevaJornada() {
    setCargando(true);
    setError(null);
    const res = await fetch("/api/jornada/nueva", { method: "POST", cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setCargando(false);
      setError(data.error ?? "No se pudo crear la jornada nueva.");
      return;
    }
    await cargarJornadaActiva();
    router.refresh();
    setCargando(false);
  }

  if (!jornada) {
    return <p className="text-mist">Cargando jornada…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="linea-cancha pt-6">
        <CountdownTimer
          inicioTs={jornada.inicio_ts}
          totalSeg={jornada.tiempo_total_seg}
          enCurso={jornada.estado === "en_curso"}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded border border-pitch-800 bg-pitch-900 p-4">
          <p className="font-display text-3xl font-bold text-turf-400">{presentes}</p>
          <p className="text-xs text-mist">Jugadores presentes</p>
        </div>
        <div className="rounded border border-pitch-800 bg-pitch-900 p-4">
          <p className="font-display text-3xl font-bold text-turf-400">{equipos}</p>
          <p className="text-xs text-mist">Equipos formados</p>
        </div>
      </section>

      <section className="flex items-center justify-between rounded border border-pitch-800 bg-pitch-900 px-4 py-3">
        <span className="text-sm text-mist">Estado de la jornada</span>
        <span className="font-medium">{ETIQUETA_ESTADO[jornada.estado]}</span>
      </section>

      {error && <p className="text-center text-sm text-card-red">{error}</p>}

      {esAdmin && jornada.estado !== "finalizada" && (
        <button
          onClick={() => cambiarEstado(jornada.estado === "pendiente" ? "iniciar" : "finalizar")}
          disabled={cargando}
          className={`w-full rounded-pill py-4 font-display text-lg font-bold transition active:scale-[0.98] disabled:opacity-50 ${
            jornada.estado === "pendiente" ? "bg-turf-500 text-pitch-950" : "bg-card-red text-chalk"
          }`}
        >
          {cargando ? "Guardando…" : jornada.estado === "pendiente" ? "Iniciar jornada" : "Finalizar jornada"}
        </button>
      )}

      {jornada.estado === "finalizada" && (
        <div className="rounded border border-dashed border-turf-500 bg-pitch-900 p-4 text-center">
          <p className="text-sm text-turf-400">✓ Jornada finalizada. Cobranza ya está desbloqueada.</p>
          {esAdmin && (
            <button
              onClick={nuevaJornada}
              disabled={cargando}
              className="mt-3 w-full rounded-pill bg-turf-500 py-3 font-display font-bold text-pitch-950 disabled:opacity-50"
            >
              {cargando ? "Creando…" : "Comenzar jornada nueva"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

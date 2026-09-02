"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { CountdownTimer } from "@/components/CountdownTimer";
import type { Jornada, SesionUsuario } from "@/lib/types";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Por iniciar",
  en_curso: "En curso",
  finalizada: "Finalizada",
};

export function DashboardClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [presentes, setPresentes] = useState(0);
  const [equipos, setEquipos] = useState(0);
  const [cargando, setCargando] = useState(false);
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

  useEffect(() => {
    fetch("/api/jornada/active")
      .then((r) => r.json())
      .then((d) => {
        setJornada(d.jornada);
        if (d.jornada) cargarConteos(d.jornada.id_jornada);
      });
  }, [cargarConteos]);

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
    const res = await fetch("/api/jornada/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, accion }),
    });
    const data = await res.json();
    setCargando(false);
    if (res.ok) setJornada(data.jornada);
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

      {esAdmin && jornada.estado !== "finalizada" && (
        <button
          onClick={() => cambiarEstado(jornada.estado === "pendiente" ? "iniciar" : "finalizar")}
          disabled={cargando}
          className={`w-full rounded-pill py-4 font-display text-lg font-bold transition active:scale-[0.98] disabled:opacity-50 ${
            jornada.estado === "pendiente" ? "bg-turf-500 text-pitch-950" : "bg-card-red text-chalk"
          }`}
        >
          {jornada.estado === "pendiente" ? "Iniciar jornada" : "Finalizar jornada"}
        </button>
      )}
    </div>
  );
}

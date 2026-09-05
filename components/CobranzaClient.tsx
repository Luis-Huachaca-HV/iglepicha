"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUsuarios } from "@/lib/useUsuarios";
import type { AsistenciaDraft, EquipoJornada, Jornada, SesionUsuario } from "@/lib/types";

function soles(valor: number) {
  return `S/ ${valor.toFixed(2)}`;
}

export function CobranzaClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [equipos, setEquipos] = useState<EquipoJornada[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaDraft[]>([]);
  const { usuarios } = useUsuarios();
  const [costoInput, setCostoInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarPago, setConfirmarPago] = useState<{ id_usuario: string; nombre: string } | null>(null);
  const [confirmarEntrega, setConfirmarEntrega] = useState<EquipoJornada | null>(null);

  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";
  const puedeMarcarPago = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);

  const cargarEquiposYAsistencias = useCallback(async (idJornada: string) => {
    const [{ data: eq }, { data: asis }] = await Promise.all([
      supabase.from("equipos_jornada").select("*").eq("id_jornada", idJornada),
      supabase.from("asistencia_draft").select("*").eq("id_jornada", idJornada),
    ]);
    setEquipos((eq as EquipoJornada[]) || []);
    setAsistencias((asis as AsistenciaDraft[]) || []);
  }, []);

  useEffect(() => {
    fetch("/api/jornada/active", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setJornada(d.jornada);
        if (d.jornada) {
          setCostoInput(String(d.jornada.costo_total ?? 0));
          cargarEquiposYAsistencias(d.jornada.id_jornada);
        }
      });
  }, [cargarEquiposYAsistencias]);

  useEffect(() => {
    if (!jornada) return;
    const canal = supabase
      .channel(`cobranza-${jornada.id_jornada}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asistencia_draft", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarEquiposYAsistencias(jornada.id_jornada)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos_jornada", filter: `id_jornada=eq.${jornada.id_jornada}` },
        () => cargarEquiposYAsistencias(jornada.id_jornada)
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
  }, [jornada?.id_jornada, cargarEquiposYAsistencias]);

  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id_usuario, u])), [usuarios]);
  const bloqueado = jornada?.estado === "en_curso";

  function rosterDe(idEquipo: string) {
    return asistencias.filter((a) => a.id_equipo === idEquipo);
  }

  async function guardarCosto() {
    if (!jornada) return;
    const valor = Number(costoInput);
    if (Number.isNaN(valor) || valor < 0) {
      setError("Ingresa un monto válido");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/cobranza/costo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, costo_total: valor }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) return setError(data.error);
    setJornada(data.jornada);
    setEquipos(data.equipos ?? []);
  }

  async function confirmarMarcarPago() {
    if (!jornada || !confirmarPago) return;
    const idUsuario = confirmarPago.id_usuario;
    setConfirmarPago(null);
    setAsistencias((prev) => prev.map((a) => (a.id_usuario === idUsuario ? { ...a, pago_realizado: true } : a)));
    await fetch("/api/cobranza/pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, pago_realizado: true }),
    });
  }

  async function confirmarMarcarEntrega() {
    if (!confirmarEntrega) return;
    const idEquipo = confirmarEntrega.id_equipo;
    setConfirmarEntrega(null);
    setEquipos((prev) => prev.map((e) => (e.id_equipo === idEquipo ? { ...e, pago_entregado_admin: true } : e)));
    await fetch("/api/cobranza/entregado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_equipo: idEquipo }),
    });
  }

  if (!jornada) return <p className="text-mist">Cargando…</p>;

  const totalRecaudado = equipos.reduce((suma, e) => {
    const roster = rosterDe(e.id_equipo);
    const cuotaJugador = roster.length > 0 ? (e.cuota_equipo || 0) / roster.length : 0;
    return suma + roster.filter((a) => a.pago_realizado).length * cuotaJugador;
  }, 0);

  const todoConcluido = equipos.length > 0 && equipos.every((e) => e.pago_entregado_admin);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Cobranza</h1>
        <p className="text-sm text-mist">
          {soles(totalRecaudado)} recaudados de {soles(jornada.costo_total || 0)}
        </p>
      </div>

      {todoConcluido && (
        <div className="rounded border border-turf-500 bg-pitch-900 p-4 text-center">
          <p className="font-display text-lg font-bold text-turf-400">🎉 ¡Gracias! Todo concluido.</p>
          <p className="mt-1 text-xs text-mist">Todos los capitanes entregaron el total al admin.</p>
        </div>
      )}

      {bloqueado && (
        <div className="rounded border border-dashed border-pitch-700 bg-pitch-900 px-4 py-3 text-center text-sm text-mist">
          🔒 Cobranza bloqueada mientras la jornada está en curso.
        </div>
      )}

      {esAdmin && (
        <div className="rounded border border-pitch-800 bg-pitch-900 p-4">
          <label className="flex items-center justify-between text-sm">
            Costo total de la cancha (S/)
            <input
              type="number"
              min={0}
              step="0.5"
              value={costoInput}
              onChange={(e) => setCostoInput(e.target.value)}
              disabled={bloqueado}
              className="w-24 rounded border border-pitch-700 bg-pitch-950 px-2 py-2 text-center disabled:opacity-40"
            />
          </label>
          {error && <p className="mt-2 text-sm text-card-red">{error}</p>}
          <button
            onClick={guardarCosto}
            disabled={guardando || bloqueado}
            className="mt-3 w-full rounded-pill bg-turf-500 py-2.5 text-sm font-bold text-pitch-950 disabled:opacity-50"
          >
            Guardar y repartir entre equipos
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {equipos.map((e) => {
          const roster = rosterDe(e.id_equipo);
          const cuotaJugador = roster.length > 0 ? (e.cuota_equipo || 0) / roster.length : 0;
          const pagados = roster.filter((a) => a.pago_realizado).length;
          return (
            <div
              key={e.id_equipo}
              className={`rounded border p-4 ${e.pago_entregado_admin ? "border-turf-500 bg-pitch-900" : "border-pitch-800 bg-pitch-900"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display font-bold">Equipo de {usuariosMap[e.id_capitan ?? ""]?.nombre ?? "?"}</span>
                <span className="text-xs text-mist">
                  {soles(e.cuota_equipo || 0)} · {pagados}/{roster.length} pagaron
                </span>
              </div>

              <ul className="flex flex-col divide-y divide-pitch-800">
                {roster.map((a) => (
                  <li key={a.id_usuario} className="flex items-center justify-between py-2">
                    <span className="text-sm">
                      {usuariosMap[a.id_usuario]?.nombre ?? "?"}
                      <span className="ml-2 text-xs text-mist">{soles(cuotaJugador)}</span>
                    </span>
                    <button
                      disabled={bloqueado || !puedeMarcarPago || a.pago_realizado}
                      onClick={() => setConfirmarPago({ id_usuario: a.id_usuario, nombre: usuariosMap[a.id_usuario]?.nombre ?? "?" })}
                      className={`rounded-pill px-3 py-2.5 text-xs font-bold transition disabled:opacity-60 ${
                        a.pago_realizado ? "bg-turf-500 text-pitch-950" : "border border-pitch-700 text-mist"
                      }`}
                    >
                      {a.pago_realizado ? "✓ Pagó" : "Debe"}
                    </button>
                  </li>
                ))}
                {roster.length === 0 && <p className="py-2 text-xs text-mist">Sin jugadores asignados.</p>}
              </ul>

              {esAdmin && (
                <button
                  disabled={bloqueado || e.pago_entregado_admin}
                  onClick={() => setConfirmarEntrega(e)}
                  className={`mt-3 w-full rounded-pill py-2.5 text-xs font-bold disabled:opacity-70 ${
                    e.pago_entregado_admin ? "bg-turf-700 text-chalk" : "border border-dashed border-floodlight text-floodlight"
                  }`}
                >
                  {e.pago_entregado_admin ? "✓ Capitán entregó el total al admin" : `Capitán entregó ${soles(e.cuota_equipo || 0)} al admin`}
                </button>
              )}
            </div>
          );
        })}
        {equipos.length === 0 && (
          <div className="rounded border border-dashed border-pitch-700 p-6 text-center text-sm text-mist">
            Todavía no hay equipos armados (completa el Draft primero).
          </div>
        )}
      </div>

      {/* Confirmación: marcar pago de un jugador (sin vuelta atrás) */}
      {confirmarPago && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm" onClick={() => setConfirmarPago(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-pitch-700 bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm text-mist">¿Confirmar que</p>
            <p className="mb-6 font-display text-xl font-bold">{confirmarPago.nombre} pagó?</p>
            <p className="mb-4 text-xs text-mist">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarPago(null)} className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm">
                Cancelar
              </button>
              <button onClick={confirmarMarcarPago} className="flex-1 rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950">
                Sí, pagó
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación: capitán entregó el total al admin (sin vuelta atrás) */}
      {confirmarEntrega && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm" onClick={() => setConfirmarEntrega(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-pitch-700 bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm text-mist">¿Confirmar que el capitán de</p>
            <p className="mb-1 font-display text-xl font-bold">
              Equipo de {usuariosMap[confirmarEntrega.id_capitan ?? ""]?.nombre ?? "?"}
            </p>
            <p className="mb-6 text-sm text-mist">te entregó {soles(confirmarEntrega.cuota_equipo || 0)}?</p>
            <p className="mb-4 text-xs text-mist">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarEntrega(null)} className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm">
                Cancelar
              </button>
              <button onClick={confirmarMarcarEntrega} className="flex-1 rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950">
                Sí, entregó
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

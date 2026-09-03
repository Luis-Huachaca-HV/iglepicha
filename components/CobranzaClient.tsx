"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { AsistenciaDraft, EquipoJornada, Jornada, RolSistema, SesionUsuario } from "@/lib/types";

interface UsuarioLista {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
}

function soles(valor: number) {
  return `S/ ${valor.toFixed(2)}`;
}

export function CobranzaClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [equipos, setEquipos] = useState<EquipoJornada[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaDraft[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [costoInput, setCostoInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esAdmin = sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin";
  const puedeMarcarAOtros = ["admin", "super_admin", "capitan"].includes(sesion.rol_sistema);

  const cargarEquiposYAsistencias = useCallback(async (idJornada: string) => {
    const [{ data: eq }, { data: asis }] = await Promise.all([
      supabase.from("equipos_jornada").select("*").eq("id_jornada", idJornada),
      supabase.from("asistencia_draft").select("*").eq("id_jornada", idJornada),
    ]);
    setEquipos((eq as EquipoJornada[]) || []);
    setAsistencias((asis as AsistenciaDraft[]) || []);
  }, []);

  useEffect(() => {
    fetch("/api/jornada/active")
      .then((r) => r.json())
      .then((d) => {
        setJornada(d.jornada);
        if (d.jornada) {
          setCostoInput(String(d.jornada.costo_total ?? 0));
          cargarEquiposYAsistencias(d.jornada.id_jornada);
        }
      });
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setUsuarios(d.usuarios ?? []));
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

  async function marcarPago(idUsuario: string, pagado: boolean) {
    if (!jornada) return;
    setAsistencias((prev) =>
      prev.map((a) => (a.id_usuario === idUsuario ? { ...a, pago_realizado: pagado } : a))
    );
    await fetch("/api/cobranza/pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, id_usuario: idUsuario, pago_realizado: pagado }),
    });
  }

  if (!jornada) return <p className="text-mist">Cargando…</p>;

  const totalRecaudado = equipos.reduce((suma, e) => {
    const roster = rosterDe(e.id_equipo);
    const cuotaJugador = roster.length > 0 ? (e.cuota_equipo || 0) / roster.length : 0;
    return suma + roster.filter((a) => a.pago_realizado).length * cuotaJugador;
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Cobranza</h1>
        <p className="text-sm text-mist">
          {soles(totalRecaudado)} recaudados de {soles(jornada.costo_total || 0)}
        </p>
      </div>

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
              className="w-24 rounded border border-pitch-700 bg-pitch-950 px-2 py-1 text-center disabled:opacity-40"
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
            <div key={e.id_equipo} className="rounded border border-pitch-800 bg-pitch-900 p-4">
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
                      disabled={bloqueado || (!puedeMarcarAOtros && sesion.id_usuario !== a.id_usuario)}
                      onClick={() => marcarPago(a.id_usuario, !a.pago_realizado)}
                      className={`rounded-pill px-3 py-1 text-xs font-bold transition disabled:opacity-30 ${
                        a.pago_realizado ? "bg-turf-500 text-pitch-950" : "border border-pitch-700 text-mist"
                      }`}
                    >
                      {a.pago_realizado ? "Pagó" : "Debe"}
                    </button>
                  </li>
                ))}
                {roster.length === 0 && <p className="py-2 text-xs text-mist">Sin jugadores asignados.</p>}
              </ul>
            </div>
          );
        })}
        {equipos.length === 0 && (
          <div className="rounded border border-dashed border-pitch-700 p-6 text-center text-sm text-mist">
            Todavía no hay equipos armados (completa el Draft primero).
          </div>
        )}
      </div>
    </div>
  );
}

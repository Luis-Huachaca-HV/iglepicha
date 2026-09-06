"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";
import { useUsuarios } from "@/lib/useUsuarios";
import { useToast } from "@/lib/useToast";
import type { Jornada, RolSistema, SesionUsuario } from "@/lib/types";

const ETIQUETA_ROL: Record<RolSistema, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  capitan: "Capitán",
  jugador_registrado: "Jugador",
};

const ROLES: RolSistema[] = ["jugador_registrado", "capitan", "admin", "super_admin"];

export function ConfiguracionesClient({ sesion }: { sesion: SesionUsuario }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const { usuarios, recargarUsuarios } = useUsuarios();
  const [tiempoTotalMin, setTiempoTotalMin] = useState("120");
  const [miniPartidoMin, setMiniPartidoMin] = useState("10");
  const [mensajeTiempo, setMensajeTiempo] = useState<string | null>(null);

  const [nombreNuevo, setNombreNuevo] = useState("");
  const [edadNueva, setEdadNueva] = useState("");
  const [rolNuevo, setRolNuevo] = useState<RolSistema>("jugador_registrado");
  const [mensajeUsuario, setMensajeUsuario] = useState<string | null>(null);
  const { mensaje: mensajeToast, mostrarToast } = useToast();
  const [confirmarReset, setConfirmarReset] = useState(false);
  const [reseteando, setReseteando] = useState(false);

  const esSuperAdmin = sesion.rol_sistema === "super_admin";

  async function hardReset() {
    setReseteando(true);
    const res = await fetch("/api/jornada/hard-reset", { method: "POST", cache: "no-store" });
    setReseteando(false);
    setConfirmarReset(false);
    if (res.ok) mostrarToast("✓ Todo reiniciado — jugadores intactos");
    else mostrarToast("No se pudo reiniciar");
  }

  useEffect(() => {
    fetch("/api/jornada/active", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setJornada(d.jornada);
        if (d.jornada) {
          setTiempoTotalMin(String(Math.round(d.jornada.tiempo_total_seg / 60)));
          setMiniPartidoMin(String(Math.round(d.jornada.duracion_mini_partido_seg / 60)));
        }
      });
  }, []);

  async function guardarTiempos() {
    if (!jornada) return;
    setMensajeTiempo(null);
    const res = await fetch("/api/jornada/tiempo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_jornada: jornada.id_jornada,
        tiempo_total_seg: Number(tiempoTotalMin) * 60,
        duracion_mini_partido_seg: Number(miniPartidoMin) * 60,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMensajeTiempo(data.error);
      return;
    }
    setJornada(data.jornada);
    setMensajeTiempo("Guardado ✓");
  }

  async function toggleMercadoPases(permitir: boolean) {
    if (!jornada) return;
    const res = await fetch("/api/draft/toggle-cambios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_jornada: jornada.id_jornada, permitir }),
    });
    const data = await res.json();
    if (res.ok) setJornada(data.jornada);
  }

  async function crearUsuario() {
    if (!nombreNuevo.trim()) {
      setMensajeUsuario("Ponle un nombre");
      return;
    }
    setMensajeUsuario(null);
    const res = await fetch("/api/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombreNuevo, edad: edadNueva ? Number(edadNueva) : undefined, rol_sistema: rolNuevo }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMensajeUsuario(data.error);
      return;
    }
    setNombreNuevo("");
    setEdadNueva("");
    setRolNuevo("jugador_registrado");
    recargarUsuarios();
    mostrarToast(`✓ ${data.usuario?.nombre ?? "Usuario"} agregado`);
  }

  async function cambiarRol(idUsuario: string, rol: RolSistema) {
    const res = await fetch("/api/usuarios/rol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_usuario: idUsuario, rol_sistema: rol }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      mostrarToast(data.error ?? "No se pudo cambiar el rol");
      recargarUsuarios();
      return;
    }
    recargarUsuarios();
  }

  async function resetearPin(idUsuario: string) {
    await fetch("/api/usuarios/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_usuario: idUsuario }),
    });
    recargarUsuarios();
    mostrarToast("✓ PIN reseteado");
  }

  return (
    <div className="flex flex-col gap-8">
      <Toast mensaje={mensajeToast} />

      <div>
        <h1 className="font-display text-2xl font-bold">Configuraciones</h1>
        <p className="text-sm text-mist">Tiempos, usuarios y mercado de pases.</p>
      </div>

      {/* Tiempos */}
      <section className="rounded border border-pitch-800 bg-pitch-900 p-4">
        <h2 className="mb-3 font-display text-lg font-bold">Tiempos</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between text-sm">
            Tiempo global de jornada (min)
            <input
              type="number"
              min={1}
              value={tiempoTotalMin}
              onChange={(e) => setTiempoTotalMin(e.target.value)}
              disabled={jornada?.estado !== "pendiente"}
              className="w-20 rounded border border-pitch-700 bg-pitch-950 px-2 py-2 text-center disabled:opacity-40"
            />
          </label>
          {jornada?.estado !== "pendiente" && (
            <p className="text-xs text-mist">El tiempo global solo se puede cambiar antes de iniciar la jornada.</p>
          )}
          <label className="flex items-center justify-between text-sm">
            Duración por defecto de cada mini-partido (min)
            <input
              type="number"
              min={1}
              value={miniPartidoMin}
              onChange={(e) => setMiniPartidoMin(e.target.value)}
              className="w-20 rounded border border-pitch-700 bg-pitch-950 px-2 py-2 text-center"
            />
          </label>
          {mensajeTiempo && <p className="text-xs text-turf-400">{mensajeTiempo}</p>}
          <button onClick={guardarTiempos} className="rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950">
            Guardar tiempos
          </button>
        </div>
      </section>

      {/* Mercado de pases */}
      {jornada && (
        <section className="flex items-center justify-between rounded border border-pitch-800 bg-pitch-900 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Mercado de pases</p>
            <p className="text-xs text-mist">Permite mover jugadores entre equipos después del Draft.</p>
          </div>
          <input
            type="checkbox"
            checked={jornada.permitir_cambios_post_draft}
            onChange={(e) => toggleMercadoPases(e.target.checked)}
            className="h-5 w-5 accent-turf-500"
          />
        </section>
      )}

      {/* Agregar usuario */}
      <section className="rounded border border-pitch-800 bg-pitch-900 p-4">
        <h2 className="mb-3 font-display text-lg font-bold">Agregar usuario</h2>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Nombre"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-base"
          />
          <input
            type="number"
            placeholder="Edad (opcional)"
            min={1}
            value={edadNueva}
            onChange={(e) => setEdadNueva(e.target.value)}
            className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-base"
          />
          <select
            value={rolNuevo}
            onChange={(e) => setRolNuevo(e.target.value as RolSistema)}
            className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-base"
          >
            {ROLES.filter((r) => esSuperAdmin || (r !== "admin" && r !== "super_admin")).map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
          {mensajeUsuario && <p className="text-sm text-card-red">{mensajeUsuario}</p>}
          <button onClick={crearUsuario} className="rounded-pill bg-turf-500 py-3 text-sm font-bold text-pitch-950">
            Crear usuario
          </button>
          {!esSuperAdmin && (
            <p className="text-xs text-mist">Solo un super admin puede crear otros admin o super admin.</p>
          )}
        </div>
      </section>

      {/* Lista de usuarios */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Usuarios ({usuarios.length})</h2>
        <ul className="flex flex-col divide-y divide-pitch-800">
          {usuarios.map((u) => (
            <li key={u.id_usuario} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{u.nombre}</span>
                <span className="text-xs text-mist">{u.edad ? `${u.edad} años` : "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <select
                  value={u.rol_sistema}
                  disabled={!esSuperAdmin && (u.rol_sistema === "admin" || u.rol_sistema === "super_admin")}
                  onChange={(e) => cambiarRol(u.id_usuario, e.target.value as RolSistema)}
                  className="flex-1 rounded border border-pitch-700 bg-pitch-950 px-2 py-2.5 text-xs disabled:opacity-40"
                >
                  {ROLES.filter((r) => esSuperAdmin || (r !== "admin" && r !== "super_admin")).map((r) => (
                    <option key={r} value={r}>
                      {ETIQUETA_ROL[r]}
                    </option>
                  ))}
                </select>
                {u.tiene_pin && (
                  <button
                    onClick={() => resetearPin(u.id_usuario)}
                    className="rounded-pill border border-card-red px-3 py-2.5 text-xs font-medium text-card-red"
                  >
                    Resetear PIN
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Reinicio total (zona de peligro) */}
      <section className="rounded border border-card-red bg-pitch-900 p-4">
        <h2 className="mb-1 font-display text-lg font-bold text-card-red">Reinicio total</h2>
        <p className="mb-3 text-xs text-mist">
          Borra la jornada actual completa: asistencia, equipos, capitanes, draft, partidos y cobranza — y arranca una
          en blanco. Los jugadores (usuarios) nunca se tocan. Úsalo solo si algo quedó atascado por un bug.
        </p>
        <button
          onClick={() => setConfirmarReset(true)}
          className="w-full rounded-pill border border-card-red py-3 text-sm font-bold text-card-red"
        >
          Reiniciar todo
        </button>
      </section>

      {confirmarReset && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-pitch-950/80 p-6 backdrop-blur-sm" onClick={() => setConfirmarReset(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-card-red bg-pitch-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 font-display text-xl font-bold text-card-red">¿Reiniciar todo?</p>
            <p className="mb-6 text-sm text-mist">
              Se borra asistencia, equipos, capitanes, draft, partidos y cobranza de la jornada actual. Los jugadores
              quedan intactos. No se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarReset(false)} className="flex-1 rounded-pill border border-pitch-700 py-3 text-sm">
                Cancelar
              </button>
              <button
                onClick={hardReset}
                disabled={reseteando}
                className="flex-1 rounded-pill bg-card-red py-3 text-sm font-bold text-chalk disabled:opacity-50"
              >
                {reseteando ? "Reiniciando…" : "Sí, reiniciar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

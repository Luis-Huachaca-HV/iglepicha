"use client";

import { useState } from "react";
import type { RolSistema } from "@/lib/types";

const EDAD_MAX_CAMOTE = 12;

type Props = {
  idUsuario: string;
  edad: number | null;
  esCamote: boolean;
  /** Rol de quien está usando la app (solo admin/super_admin pueden marcar). */
  rolActual: RolSistema;
  /** Se ejecuta cuando el servidor confirmó el cambio. */
  onChange?: (esCamote: boolean) => void;
  /** Para mostrar errores con el toast de la pantalla (opcional). */
  onError?: (mensaje: string) => void;
  className?: string;
};

/**
 * Botón pill "Camote" (migración 013). Solo aparece si el jugador tiene
 * menos de 12 años y quien lo ve es admin o super_admin. Llama a
 * POST /api/usuarios/camote y avisa con onChange al confirmar.
 */
export function CamoteToggle({ idUsuario, edad, esCamote, rolActual, onChange, onError, className }: Props) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeMarcar = rolActual === "admin" || rolActual === "super_admin";
  const esMenor = edad != null && edad < EDAD_MAX_CAMOTE;
  if (!puedeMarcar || !esMenor) return null;

  async function alternar() {
    if (pendiente) return;
    setPendiente(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios/camote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id_usuario: idUsuario, es_camote: !esCamote }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; usuario?: { es_camote?: boolean } };
      if (!res.ok) {
        const mensaje = json.error ?? "No se pudo cambiar el estado de Camote";
        setError(mensaje);
        onError?.(mensaje);
        return;
      }
      onChange?.(json.usuario?.es_camote === true);
    } catch {
      const mensaje = "Sin conexión: no se pudo guardar el cambio";
      setError(mensaje);
      onError?.(mensaje);
    } finally {
      setPendiente(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={alternar}
        disabled={pendiente}
        aria-pressed={esCamote}
        title={esCamote ? "Quitar marca de Camote" : "Marcar como Camote (no entra al draft ni paga)"}
        className={
          "inline-flex min-h-[44px] items-center gap-1.5 rounded-pill px-4 text-sm font-bold transition " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turf-500 " +
          "disabled:opacity-60 " +
          (esCamote
            ? "bg-turf-500 text-pitch-950"
            : "border border-white/20 bg-white/5 text-white hover:bg-white/10")
        }
      >
        <span aria-hidden="true">{esCamote ? "✓" : "+"}</span>
        {pendiente ? "Guardando…" : "Camote"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export default CamoteToggle;

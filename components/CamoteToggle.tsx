"use client";

import { useState } from "react";

export function CamoteToggle({
  idUsuario,
  edad,
  esCamote,
  onChanged,
  onError,
}: {
  idUsuario: string;
  edad: number | null;
  esCamote: boolean;
  onChanged?: (nuevo: boolean) => void;
  onError?: (msg: string) => void;
}) {
  const [cargando, setCargando] = useState(false);

  if (typeof edad !== "number" || edad >= 12) return null;

  async function cambiar(nuevo: boolean) {
    setCargando(true);
    try {
      const res = await fetch("/api/usuarios/camote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: idUsuario, es_camote: nuevo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError?.(data?.error ?? "No se pudo actualizar Camote");
      } else {
        onChanged?.(nuevo);
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <label className="mb-4 flex cursor-pointer items-center justify-between rounded border border-floodlight/40 bg-floodlight/10 px-3 py-2.5">
      <div>
        <span className="block text-sm font-bold text-floodlight">Camote (menor de 12)</span>
        <span className="block text-xs text-mist">
          Asiste y entra a un equipo al cerrar el draft, pero no ocupa cupo ni paga cancha.
        </span>
      </div>
      <input
        type="checkbox"
        checked={esCamote}
        disabled={cargando}
        onChange={(e) => cambiar(e.target.checked)}
        className="h-5 w-5 accent-floodlight"
      />
    </label>
  );
}

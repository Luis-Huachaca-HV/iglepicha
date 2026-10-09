"use client";

import { Avatar } from "@/components/Avatar";
import type { Posicion } from "@/lib/types";

const FILAS: { posicion: Posicion; label: string }[] = [
  { posicion: "DEL", label: "Delantera" },
  { posicion: "MC", label: "Medio" },
  { posicion: "DEF", label: "Defensa" },
  { posicion: "POR", label: "Portero" },
];

export type JugadorCancha = {
  id: string;
  nombre: string;
  posicion: Posicion | null;
  valoracion: number | null;
};

export function CanchaVista({
  nombreEquipo,
  color,
  jugadores,
}: {
  nombreEquipo: string;
  color: string;
  jugadores: JugadorCancha[];
}) {
  const sinPosicion = jugadores.filter((j) => !j.posicion);

  return (
    <div className="overflow-hidden rounded-2xl border border-pitch-800">
      <div className="flex items-center justify-between bg-pitch-900 px-4 py-2">
        <span className="font-display text-sm font-bold">{nombreEquipo}</span>
        <span className="text-xs text-mist">{jugadores.length} en cancha</span>
      </div>
      <div
        className="relative flex min-h-[28rem] flex-col justify-between px-3 py-4"
        style={{
          background:
            "repeating-linear-gradient(180deg, #15803d 0 2.5rem, #166534 2.5rem 5rem)",
        }}
      >
        <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/70" />
        <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-white/70" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
        {FILAS.map((fila) => {
          const enFila = jugadores.filter((j) => j.posicion === fila.posicion);
          return (
            <div key={fila.posicion} className="relative z-10 flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/80">{fila.label}</span>
              <div className="flex flex-wrap justify-center gap-2">
                {enFila.length === 0 && <span className="text-[10px] text-white/50">—</span>}
                {enFila.map((j) => (
                  <div key={j.id} className="relative flex w-14 flex-col items-center">
                    <Avatar nombre={j.nombre} color={color} />
                    {j.valoracion != null && (
                      <span className="absolute -right-1 -top-1 rounded-full bg-pitch-950 px-1.5 py-0.5 text-[10px] font-bold text-turf-400">
                        {j.valoracion.toFixed(1)}
                      </span>
                    )}
                    <span className="mt-1 max-w-full truncate text-center text-[10px] font-medium text-white">{j.nombre}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {sinPosicion.length > 0 && (
          <div className="relative z-10 text-center text-[10px] text-white/80">
            Sin posición: {sinPosicion.map((j) => j.nombre).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

interface PinPadProps {
  titulo: string;
  subtitulo?: string;
  /** Si true, pide el PIN dos veces (bootstrap de un usuario sin PIN aún) */
  confirmar?: boolean;
  onSubmit: (pin: string, confirmarPin?: string) => void;
  error?: string | null;
  cargando?: boolean;
}

export function PinPad({ titulo, subtitulo, confirmar, onSubmit, error, cargando }: PinPadProps) {
  const [pin, setPin] = useState("");
  const [confirmarPin, setConfirmarPin] = useState("");
  const [fase, setFase] = useState<"pin" | "confirmar">("pin");

  const activo = fase === "pin" ? pin : confirmarPin;
  const setActivo = fase === "pin" ? setPin : setConfirmarPin;

  function presionar(digito: string) {
    if (activo.length >= 4) return;
    const siguiente = activo + digito;
    setActivo(siguiente);
    if (siguiente.length === 4) {
      if (confirmar && fase === "pin") {
        setTimeout(() => setFase("confirmar"), 150);
      } else {
        setTimeout(() => onSubmit(pin, siguiente), 150);
      }
    }
  }

  function borrar() {
    setActivo(activo.slice(0, -1));
  }

  const digitos = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold">{titulo}</h2>
        {subtitulo && <p className="mt-1 text-sm text-mist">{subtitulo}</p>}
        {confirmar && (
          <p className="mt-1 text-xs uppercase tracking-wide text-floodlight">
            {fase === "pin" ? "Paso 1 de 2 · elige tu PIN" : "Paso 2 de 2 · repítelo"}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-turf-500 ${
              i < activo.length ? "bg-turf-500" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-card-red">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {digitos.map((d, i) =>
          d === "" ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={cargando}
              onClick={() => (d === "⌫" ? borrar() : presionar(d))}
              className="h-16 w-16 rounded-full border border-pitch-700 bg-pitch-900 font-display text-xl font-bold text-chalk transition active:scale-95 active:bg-turf-700 disabled:opacity-40"
            >
              {d}
            </button>
          )
        )}
      </div>
    </div>
  );
}

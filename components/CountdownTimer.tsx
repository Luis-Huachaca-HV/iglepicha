"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  inicioTs: string | null;
  totalSeg: number;
  enCurso: boolean;
}

function formatear(seg: number) {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${ss
    .toString()
    .padStart(2, "0")}`;
}

export function CountdownTimer({ inicioTs, totalSeg, enCurso }: CountdownTimerProps) {
  const [restante, setRestante] = useState(totalSeg);

  useEffect(() => {
    if (!enCurso || !inicioTs) {
      setRestante(totalSeg);
      return;
    }
    function tick() {
      const inicio = new Date(inicioTs as string).getTime();
      const transcurrido = (Date.now() - inicio) / 1000;
      setRestante(totalSeg - transcurrido);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inicioTs, totalSeg, enCurso]);

  const agotandose = enCurso && restante <= 300; // últimos 5 min

  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-wide text-mist">
        {enCurso ? "Tiempo restante de jornada" : "Duración configurada"}
      </p>
      <p
        className={`font-display tabular text-5xl font-bold ${
          agotandose ? "animate-pulseDot text-card-red" : "text-chalk"
        }`}
      >
        {formatear(restante)}
      </p>
    </div>
  );
}

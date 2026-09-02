"use client";

const ETIQUETAS: { clave: string; label: string }[] = [
  { clave: "velocidad", label: "Vel" },
  { clave: "resistencia", label: "Res" },
  { clave: "ataque", label: "Ata" },
  { clave: "defensa", label: "Def" },
  { clave: "pase_corto", label: "P.corto" },
  { clave: "pase_largo", label: "P.largo" },
  { clave: "regate", label: "Regate" },
  { clave: "juego_equipo", label: "Equipo" },
  { clave: "agresividad", label: "Agres" },
];

interface RadarChartProps {
  /** Promedio 1-10 por atributo, o null si el jugador aún no tiene votos (S/C) */
  valores: Record<string, number> | null;
  size?: number;
}

export function RadarChart({ valores, size = 200 }: RadarChartProps) {
  const centro = size / 2;
  const radio = size / 2 - 28;
  const n = ETIQUETAS.length;

  function punto(i: number, valor: number) {
    const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (valor / 10) * radio;
    return [centro + r * Math.cos(angulo), centro + r * Math.sin(angulo)];
  }

  const anillos = [0.25, 0.5, 0.75, 1];

  if (!valores) {
    return (
      <div className="flex flex-col items-center justify-center gap-2" style={{ width: size, height: size }}>
        <span className="font-display text-3xl font-bold text-mist">S/C</span>
        <span className="text-xs text-mist">Sin clasificar todavía</span>
      </div>
    );
  }

  const puntos = ETIQUETAS.map((e, i) => punto(i, valores[e.clave] ?? 0));
  const pathData = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {anillos.map((a) => (
        <polygon
          key={a}
          points={ETIQUETAS.map((_, i) => punto(i, 10 * a).join(",")).join(" ")}
          fill="none"
          stroke="#234A2F"
          strokeWidth={1}
        />
      ))}
      {ETIQUETAS.map((e, i) => {
        const [x, y] = punto(i, 10);
        return <line key={e.clave} x1={centro} y1={centro} x2={x} y2={y} stroke="#234A2F" strokeWidth={1} />;
      })}
      <polygon points={puntos.map((p) => p.join(",")).join(" ")} fill="#2F9E44" fillOpacity={0.35} stroke="#4CB85C" strokeWidth={2} />
      {ETIQUETAS.map((e, i) => {
        const [x, y] = punto(i, 11.6);
        return (
          <text key={e.clave} x={x} y={y} fontSize={9} fill="#8FA396" textAnchor="middle" dominantBaseline="middle">
            {e.label}
          </text>
        );
      })}
    </svg>
  );
}

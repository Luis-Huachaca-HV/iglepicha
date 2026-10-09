export function Avatar({
  nombre,
  color,
  anillo,
}: {
  nombre: string;
  color?: string;
  anillo?: "asistencia" | "ticket" | "equipo";
}) {
  const borde =
    anillo === "asistencia" ? "0 0 0 2px #eab308" : anillo === "ticket" ? "0 0 0 2px #22c55e" : undefined;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-950"
      style={{ backgroundColor: color ?? "#334155", color: "#f8fafc", boxShadow: borde }}
      aria-hidden
    >
      {nombre.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export const COLORES_EQUIPO = ["#eab308", "#22c55e", "#38bdf8", "#fb7185", "#a78bfa", "#fb923c"];

export function colorDeEquipo(indice: number) {
  return COLORES_EQUIPO[indice % COLORES_EQUIPO.length] ?? "#334155";
}

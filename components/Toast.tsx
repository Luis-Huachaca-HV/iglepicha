"use client";

export function Toast({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
      style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-pill bg-turf-500 px-4 py-2 text-sm font-bold text-pitch-950 shadow-lg">{mensaje}</div>
    </div>
  );
}

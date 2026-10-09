"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { House, Settings } from "lucide-react";
import type { SesionUsuario } from "@/lib/types";

const ETIQUETA_ROL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  capitan: "Capitán",
  jugador_registrado: "Jugador",
};

export function TopBar({ sesion, estadoLabel }: { sesion: SesionUsuario; estadoLabel?: string }) {
  const router = useRouter();

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="linea-cancha sticky top-0 z-10 flex items-center justify-between border-b border-pitch-800 bg-pitch-900/90 px-4 pb-3 backdrop-blur"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="rounded-full p-2 text-mist" aria-label="Inicio">
          <House size={18} />
        </Link>
        {(sesion.rol_sistema === "admin" || sesion.rol_sistema === "super_admin") && (
          <Link href="/configuraciones" className="rounded-full p-2 text-mist" aria-label="Configuraciones">
            <Settings size={18} />
          </Link>
        )}
        {estadoLabel && (
          <span className="flex items-center gap-1.5 rounded-pill bg-pitch-800 px-2.5 py-1 text-xs font-medium text-floodlight">
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-floodlight" />
            {estadoLabel}
          </span>
        )}
      </div>
      <button onClick={salir} className="flex items-center gap-2 text-right">
        <span className="text-sm leading-tight">
          <span className="block font-medium text-chalk">{sesion.nombre}</span>
          <span className="block text-xs text-mist">{ETIQUETA_ROL[sesion.rol_sistema]}</span>
        </span>
      </button>
    </header>
  );
}

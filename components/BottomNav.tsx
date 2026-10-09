"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Timer, Trophy, Users, Wallet } from "lucide-react";
import type { RolSistema } from "@/lib/types";

const TABS = [
  { href: "/draft", label: "Equipos", icono: Shield },
  { href: "/jugadores", label: "Jugadores", icono: Users },
  { href: "/partidos", label: "Partidos", icono: Timer },
  { href: "/estadisticas", label: "Estadísticas", icono: Trophy },
  { href: "/cobranza", label: "Cobranza", icono: Wallet },
];

const ACCESO_POR_ROL: Record<RolSistema, string[]> = {
  super_admin: TABS.map((t) => t.href),
  admin: TABS.map((t) => t.href),
  capitan: TABS.map((t) => t.href),
  jugador_registrado: ["/partidos", "/jugadores", "/estadisticas"],
};

export function BottomNav({ rol }: { rol: RolSistema }) {
  const pathname = usePathname();
  const permitidas = new Set(ACCESO_POR_ROL[rol]);
  const tabsVisibles = TABS.filter((t) => permitidas.has(t.href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-pitch-800 bg-pitch-900/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md">
        {tabsVisibles.map((tab) => {
          const activo = pathname === tab.href;
          const Icono = tab.icono;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
                  activo ? "text-turf-400" : "text-mist"
                }`}
              >
                <Icono size={18} strokeWidth={activo ? 2.4 : 1.8} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

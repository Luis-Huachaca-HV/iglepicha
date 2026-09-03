"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RolSistema } from "@/lib/types";

const TABS = [
  { href: "/dashboard", label: "Dashboard", disponible: true },
  { href: "/partidos", label: "Partidos", disponible: true },
  { href: "/draft", label: "Draft", disponible: true },
  { href: "/jugadores", label: "Jugadores", disponible: true },
  { href: "/cobranza", label: "Cobranza", disponible: true },
  { href: "/configuraciones", label: "Config", disponible: true },
];

// Tabs visibles por rol, según el spec original.
const ACCESO_POR_ROL: Record<RolSistema, string[]> = {
  super_admin: ["/dashboard", "/partidos", "/draft", "/jugadores", "/cobranza", "/configuraciones"],
  admin: ["/dashboard", "/partidos", "/draft", "/jugadores", "/cobranza", "/configuraciones"],
  capitan: ["/dashboard", "/partidos", "/draft", "/jugadores", "/cobranza"],
  jugador_registrado: ["/dashboard", "/partidos", "/jugadores"],
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
          return (
            <li key={tab.href} className="flex-1">
              {tab.disponible ? (
                <Link
                  href={tab.href}
                  className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${
                    activo ? "text-floodlight" : "text-mist"
                  }`}
                >
                  <span className={`h-1 w-6 rounded-pill ${activo ? "bg-floodlight" : "bg-transparent"}`} />
                  {tab.label}
                </Link>
              ) : (
                <span className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-pitch-700">
                  <span className="h-1 w-6 rounded-pill bg-transparent" />
                  {tab.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

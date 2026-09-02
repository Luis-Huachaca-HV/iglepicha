"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Dashboard", disponible: true },
  { href: "/partidos", label: "Partidos", disponible: false },
  { href: "/draft", label: "Draft", disponible: false },
  { href: "/jugadores", label: "Jugadores", disponible: true },
  { href: "/cobranza", label: "Cobranza", disponible: false },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-pitch-800 bg-pitch-900/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const activo = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              {tab.disponible ? (
                <Link
                  href={tab.href}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                    activo ? "text-floodlight" : "text-mist"
                  }`}
                >
                  <span className={`h-1 w-6 rounded-pill ${activo ? "bg-floodlight" : "bg-transparent"}`} />
                  {tab.label}
                </Link>
              ) : (
                <span className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-pitch-700">
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

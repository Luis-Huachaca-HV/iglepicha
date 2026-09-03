import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { DraftClient } from "@/components/DraftClient";

export default function DraftPage() {
  const sesion = obtenerSesionActual();
  if (!sesion) redirect("/login");

  return (
    <>
      <TopBar sesion={sesion} estadoLabel="Draft" />
      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        <DraftClient sesion={sesion} />
      </main>
      <BottomNav rol={sesion.rol_sistema} />
    </>
  );
}

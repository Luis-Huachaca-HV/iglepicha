import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { CobranzaClient } from "@/components/CobranzaClient";

export default async function CobranzaPage() {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");

  return (
    <>
      <TopBar sesion={sesion} />
      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        <CobranzaClient sesion={sesion} />
      </main>
      <BottomNav rol={sesion.rol_sistema} />
    </>
  );
}

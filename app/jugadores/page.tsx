import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { JugadoresClient } from "@/components/JugadoresClient";

export default async function JugadoresPage() {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");

  return (
    <>
      <TopBar sesion={sesion} estadoLabel="En vivo" />
      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        <JugadoresClient sesion={sesion} />
      </main>
      <BottomNav rol={sesion.rol_sistema} />
    </>
  );
}

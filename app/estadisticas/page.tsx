import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { EstadisticasClient } from "@/components/EstadisticasClient";

export default async function EstadisticasPage() {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");

  return (
    <>
      <TopBar sesion={sesion} estadoLabel="Rankings" />
      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        <EstadisticasClient />
      </main>
      <BottomNav rol={sesion.rol_sistema} />
    </>
  );
}

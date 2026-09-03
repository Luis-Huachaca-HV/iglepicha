import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { ConfiguracionesClient } from "@/components/ConfiguracionesClient";

export default function ConfiguracionesPage() {
  const sesion = obtenerSesionActual();
  if (!sesion) redirect("/login");
  if (sesion.rol_sistema !== "admin" && sesion.rol_sistema !== "super_admin") redirect("/dashboard");

  return (
    <>
      <TopBar sesion={sesion} />
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <ConfiguracionesClient sesion={sesion} />
      </main>
      <BottomNav rol={sesion.rol_sistema} />
    </>
  );
}

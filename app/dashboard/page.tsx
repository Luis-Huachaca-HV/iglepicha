import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { DashboardClient } from "@/components/DashboardClient";

export default function DashboardPage() {
  const sesion = obtenerSesionActual();
  if (!sesion) redirect("/login");

  return (
    <>
      <TopBar sesion={sesion} />
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <DashboardClient sesion={sesion} />
      </main>
      <BottomNav />
    </>
  );
}

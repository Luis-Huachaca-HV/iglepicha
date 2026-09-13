import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";

export default async function Home() {
  const sesion = await obtenerSesionActual();
  redirect(sesion ? "/dashboard" : "/login");
}

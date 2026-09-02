import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/lib/session";

export default function Home() {
  const sesion = obtenerSesionActual();
  redirect(sesion ? "/dashboard" : "/login");
}

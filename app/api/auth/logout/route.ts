import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION } from "@/lib/session";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(NOMBRE_COOKIE_SESION, "", { path: "/", maxAge: 0 });
  return res;
}

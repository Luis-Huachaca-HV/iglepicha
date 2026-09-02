import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(NOMBRE_COOKIE_SESION, "", { path: "/", maxAge: 0 });
  return res;
}

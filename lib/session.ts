import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { SesionUsuario } from "./types";

const COOKIE_NAME = "pichangas_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function crearCookieSesion(sesion: SesionUsuario): string {
  const payload = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  const firma = sign(payload);
  return `${payload}.${firma}`;
}

export function leerSesionDesdeCookie(valor: string | undefined): SesionUsuario | null {
  if (!valor) return null;
  const [payload, firma] = valor.split(".");
  if (!payload || !firma) return null;
  const firmaEsperada = sign(payload);
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Helper para Server Components / Route Handlers
export async function obtenerSesionActual(): Promise<SesionUsuario | null> {
  const cookieStore = await cookies();
  const valor = cookieStore.get(COOKIE_NAME)?.value;
  return leerSesionDesdeCookie(valor);
}

export const NOMBRE_COOKIE_SESION = COOKIE_NAME;

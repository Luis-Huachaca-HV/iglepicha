import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Hash simple con scrypt (nativo de Node, sin dependencias externas).
// Formato almacenado: "salt:hash" en hex.
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Valida que el valor guardado tenga el formato "salt:hash" real. Protege
// contra el caso de que alguien haya escrito a mano el texto "NULL" (o
// cualquier otra cosa) en la celda de Supabase en vez de dejarla vacía de
// verdad: eso NO cuenta como "tiene PIN", así que la app puede
// autocorregirse pidiendo crear uno nuevo en vez de quedar trabada.
export function esPinHashValido(valor: string | null | undefined): valor is string {
  return !!valor && valor.includes(":") && valor.split(":").length === 2;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const attempt = scryptSync(pin, salt, 64);
  if (attempt.length !== hashBuffer.length) return false;
  return timingSafeEqual(attempt, hashBuffer);
}

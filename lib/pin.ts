import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Hash simple con scrypt (nativo de Node, sin dependencias externas).
// Formato almacenado: "salt:hash" en hex.
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const attempt = scryptSync(pin, salt, 64);
  if (attempt.length !== hashBuffer.length) return false;
  return timingSafeEqual(attempt, hashBuffer);
}

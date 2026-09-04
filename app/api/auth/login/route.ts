import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashPin, verifyPin, esPinHashValido } from "@/lib/pin";
import { crearCookieSesion, NOMBRE_COOKIE_SESION } from "@/lib/session";
import { requierePin } from "@/lib/types";

// Nunca cachear: esta ruta siempre debe leer/escribir el estado más
// reciente de Supabase, no una versión congelada del último deploy.
export const dynamic = "force-dynamic";

// POST /api/auth/login
// body: { id_usuario: string, pin?: string, confirmar_pin?: string }
//
// Flujo:
// - jugador_registrado: entra solo con el nombre, sin PIN.
// - admin / capitan / super_admin:
//     - si el usuario aún no tiene pin_hash (primera vez), pin + confirmar_pin
//       deben coincidir y se guardan como su PIN.
//     - si ya tiene pin_hash, se valida el PIN ingresado.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id_usuario, pin, confirmar_pin } = body as {
    id_usuario?: string;
    pin?: string;
    confirmar_pin?: string;
  };

  if (!id_usuario) {
    return NextResponse.json({ error: "Falta id_usuario" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: usuario, error } = await admin
    .from("usuarios")
    .select("id_usuario, nombre, rol_sistema, pin_hash")
    .eq("id_usuario", id_usuario)
    .single();

  if (error || !usuario) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (requierePin(usuario.rol_sistema)) {
    if (!esPinHashValido(usuario.pin_hash)) {
      // Primer ingreso: crear PIN
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
      }
      if (pin !== confirmar_pin) {
        return NextResponse.json({ error: "Los PIN no coinciden" }, { status: 400 });
      }
      const hash = hashPin(pin);
      const { error: updateError } = await admin
        .from("usuarios")
        .update({ pin_hash: hash })
        .eq("id_usuario", id_usuario);
      if (updateError) {
        return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
      }
    } else {
      if (!pin || !verifyPin(pin, usuario.pin_hash)) {
        return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
      }
    }
  }

  const cookieValor = crearCookieSesion({
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    rol_sistema: usuario.rol_sistema,
  });

  const res = NextResponse.json({
    ok: true,
    sesion: { id_usuario: usuario.id_usuario, nombre: usuario.nombre, rol_sistema: usuario.rol_sistema },
  });
  res.cookies.set(NOMBRE_COOKIE_SESION, cookieValor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 horas, suficiente para una jornada larga
  });
  return res;
}

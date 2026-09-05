"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/PinPad";
import { useUsuarios, type UsuarioLista } from "@/lib/useUsuarios";
import { requierePin } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { usuarios } = useUsuarios();
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = usuarios.find((u) => u.id_usuario === seleccionadoId) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function ingresar(usuario: UsuarioLista, pin?: string, confirmarPin?: string) {
    setCargando(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_usuario: usuario.id_usuario, pin, confirmar_pin: confirmarPin }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) {
      setError(data.error ?? "Algo salió mal");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  function elegir(usuario: UsuarioLista) {
    setError(null);
    if (!requierePin(usuario.rol_sistema)) {
      ingresar(usuario);
    } else {
      setSeleccionadoId(usuario.id_usuario);
    }
  }

  if (seleccionado) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-8 px-6"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <PinPad
          titulo={`Hola, ${seleccionado.nombre.split(" ")[0]}`}
          subtitulo={
            seleccionado.tiene_pin ? "Ingresa tu PIN de 4 dígitos" : "Aún no tienes PIN — crea uno ahora"
          }
          confirmar={!seleccionado.tiene_pin}
          error={error}
          cargando={cargando}
          onSubmit={(pin, confirmarPin) => ingresar(seleccionado, pin, confirmarPin)}
        />
        <button onClick={() => setSeleccionadoId(null)} className="text-sm text-mist underline underline-offset-4">
          Elegir otra persona
        </button>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-screen max-w-md flex-col px-6"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mb-8">
        <p className="font-display text-sm uppercase tracking-wide text-turf-400">Pichangas</p>
        <h1 className="mt-1 font-display text-3xl font-bold">¿Quién juega hoy?</h1>
        <p className="mt-1 text-sm text-mist">Toca tu nombre para entrar.</p>
      </div>

      {usuarios.length === 0 && (
        <div className="linea-cancha mt-4 rounded border border-dashed border-pitch-700 p-6 text-center">
          <p className="text-chalk">Todavía no hay usuarios creados.</p>
          <p className="mt-2 text-sm text-mist">
            Pídele a un admin que entre a Configuraciones y agregue el primer usuario.
          </p>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {usuarios.map((u) => (
          <li key={u.id_usuario}>
            <button
              onClick={() => elegir(u)}
              className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded border border-pitch-800 bg-pitch-900 transition active:scale-95 active:border-turf-500"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-turf-700 font-display font-bold text-chalk">
                {u.nombre.charAt(0).toUpperCase()}
              </span>
              <span className="px-2 text-center text-sm font-medium leading-tight">{u.nombre}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

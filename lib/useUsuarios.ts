"use client";

import { useCallback, useEffect, useState } from "react";
import type { Posicion, RolSistema } from "@/lib/types";

export interface UsuarioLista {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
  posicion: Posicion | null;
  tiene_pin: boolean;
}

// La lista pasa por la API para que el navegador nunca reciba pin_hash.
// Se refresca al montar, cada cinco segundos y al recuperar foco; las
// respuestas llevan no-store y la ruta es dinámica.
export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);

  const recargarUsuarios = useCallback(async () => {
    try {
      const res = await fetch("/api/usuarios", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUsuarios((data.usuarios ?? []) as UsuarioLista[]);
    } catch {
      // Conserva la lista actual ante un corte momentáneo de red.
    }
  }, []);

  useEffect(() => {
    recargarUsuarios();
    const id = window.setInterval(recargarUsuarios, 5000);
    const alVolver = () => {
      if (document.visibilityState === "visible") recargarUsuarios();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [recargarUsuarios]);

  return { usuarios, recargarUsuarios };
}

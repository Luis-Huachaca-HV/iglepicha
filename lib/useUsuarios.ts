"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RolSistema } from "@/lib/types";

export interface UsuarioLista {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
  tiene_pin?: boolean;
}

// Hook compartido: carga /api/usuarios y se mantiene al día solo, sin
// necesidad de refrescar la página, en cuanto alguien agrega/edita un
// usuario desde cualquier pantalla (Jugadores, Configuraciones, etc.)
export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);

  const recargarUsuarios = useCallback(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setUsuarios(d.usuarios ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    recargarUsuarios();
    const canal = supabase
      .channel(`usuarios-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => recargarUsuarios())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recargarUsuarios]);

  return { usuarios, recargarUsuarios };
}

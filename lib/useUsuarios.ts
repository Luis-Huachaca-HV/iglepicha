"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Posicion, RolSistema } from "@/lib/types";

export interface UsuarioLista {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
  posicion: Posicion | null;
  tiene_pin?: boolean;
  es_camote?: boolean;
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);

  const recargarUsuarios = useCallback(async () => {
    try {
      const res = await fetch("/api/usuarios", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.usuarios)) {
          setUsuarios(d.usuarios as UsuarioLista[]);
          return;
        }
      }
    } catch {
      // respaldo directo a Supabase si falla el fetch
    }

    const conCamote = await supabase
      .from("usuarios")
      .select("id_usuario, nombre, edad, rol_sistema, posicion, es_camote")
      .order("nombre", { ascending: true });

    if (!conCamote.error && conCamote.data) {
      setUsuarios(conCamote.data as UsuarioLista[]);
      return;
    }

    const sinCamote = await supabase
      .from("usuarios")
      .select("id_usuario, nombre, edad, rol_sistema, posicion")
      .order("nombre", { ascending: true });

    if (sinCamote.data) {
      setUsuarios(sinCamote.data as UsuarioLista[]);
    }
  }, []);

  useEffect(() => {
    recargarUsuarios();
    const canal = supabase
      .channel(`usuarios-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => {
        recargarUsuarios();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recargarUsuarios]);

  return { usuarios, recargarUsuarios };
}

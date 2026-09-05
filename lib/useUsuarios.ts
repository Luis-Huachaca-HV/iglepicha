"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { esPinHashValido } from "@/lib/pin-formato";
import type { Posicion, RolSistema } from "@/lib/types";

export interface UsuarioLista {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
  posicion: Posicion | null;
  tiene_pin: boolean;
}

// Hook compartido para la lista de usuarios. Lee DIRECTO de Supabase desde
// el navegador (igual que equipos/asistencia/partidos en el resto de la
// app) en vez de pasar por una ruta de Next.js — así evitamos cualquier
// capa extra de caché de Next/Vercel que pueda quedarse con una versión
// vieja. Se mantiene al día solo vía Realtime.
export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);

  const recargarUsuarios = useCallback(async () => {
    const { data } = await supabase
      .from("usuarios")
      .select("id_usuario, nombre, edad, rol_sistema, posicion, pin_hash")
      .order("nombre", { ascending: true });
    setUsuarios(
      (data || []).map((u) => ({
        id_usuario: u.id_usuario,
        nombre: u.nombre,
        edad: u.edad,
        rol_sistema: u.rol_sistema,
        posicion: u.posicion,
        tiene_pin: esPinHashValido(u.pin_hash),
      }))
    );
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

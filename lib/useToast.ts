"use client";

import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarToast = useCallback((texto: string) => {
    setMensaje(texto);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMensaje(null), 2500);
  }, []);

  return { mensaje, mostrarToast };
}

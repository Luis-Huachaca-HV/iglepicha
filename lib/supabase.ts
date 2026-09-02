"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente de navegador: usa la anon key, solo puede LEER (ver políticas RLS
// en supabase/schema.sql). Toda escritura pasa por /api/* con la service role.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});

import { createClient } from "@supabase/supabase-js";

// SOLO usar dentro de API routes (server-side). Nunca importar desde
// un componente "use client": expondría la service role key.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

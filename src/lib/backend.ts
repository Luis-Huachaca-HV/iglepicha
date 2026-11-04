// Cosmos completa estos dos valores públicos cuando conectas un proyecto Supabase en el panel Backend.
export const backendConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// La app no usa ISR ni caché de datos: todas las rutas dinámicas consultan
// Supabase en cada petición. Por eso no requiere un bucket R2 adicional.
export default defineCloudflareConfig({});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Desactiva por completo el caché de navegación del lado del cliente
  // (Router Cache) de Next.js. Sin esto, volver a una pantalla (Draft,
  // Cobranza, Dashboard...) puede mostrar una versión "congelada" de
  // hace un rato en vez de datos frescos. Con dynamic/static en 0,
  // CADA navegación vuelve a pedir todo, siempre.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  async headers() {
    return [
      {
        // Aplica a toda la app (páginas y rutas de API): nunca guardar
        // en caché el documento/HTML ni las respuestas, en el navegador
        // ni en el CDN de Vercel.
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

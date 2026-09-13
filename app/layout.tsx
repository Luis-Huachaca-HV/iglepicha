import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pichangas",
  description: "Gestión de pichangas: asistencia, equipos y marcador en vivo.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0B1710",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-body bg-pitch-950 text-chalk antialiased">
        {children}
      </body>
    </html>
  );
}

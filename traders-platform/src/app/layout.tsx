import type { Metadata, Viewport } from "next";
import "./globals.css";

// Sin indexación en ninguna página. Sin analytics, sin Open Graph, sin sitemap.
export const metadata: Metadata = {
  title: "Plataforma privada de pruebas",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow"
        >
          Entorno privado de pruebas. No es un servicio de inversión.
        </div>
        {children}
      </body>
    </html>
  );
}

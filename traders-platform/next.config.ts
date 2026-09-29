import type { NextConfig } from "next";
import { assertSafeEnvironment } from "./src/lib/env-guard";

// Bloquea `next dev`, `next build` y `next start` si el entorno no es un
// entorno privado de pruebas (claves live de Stripe, PUBLIC_LAUNCH != false,
// allowlist inválida...). Ver src/lib/env-guard.ts.
assertSafeEnvironment();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Sin indexación, también para respuestas que no son HTML.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseEmailList } from "@/lib/env-guard";

/**
 * Login obligatorio en TODA la app. Única ruta pública con contenido: /login.
 * /auth/* son endpoints técnicos del flujo de login (sin contenido) y
 * /api/stripe/webhook se autentica con la firma de Stripe.
 */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/error", "/api/stripe/webhook"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() valida el token contra Supabase Auth (no confía solo en la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  response.headers.set("Cache-Control", "private, no-store");

  if (isPublic(pathname)) {
    if (user && pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!user) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  // La allowlist se comprueba en CADA petición: quitar un email de
  // ALLOWED_EMAILS revoca el acceso de inmediato aunque tenga sesión.
  const allowed = parseEmailList(process.env.ALLOWED_EMAILS);
  if (!user.email || !allowed.includes(user.email.toLowerCase())) {
    await supabase.auth.signOut();
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "not_allowed");
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // Todo salvo estáticos de Next y robots.txt (que debe ser legible por
    // los crawlers para que obedezcan el Disallow).
    "/((?!_next/static|_next/image|icon.svg|robots.txt).*)",
  ],
};

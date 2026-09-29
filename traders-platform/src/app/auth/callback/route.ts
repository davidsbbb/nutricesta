import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isEmailAllowed, serverConfig } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Endpoint técnico del enlace mágico: canjea el código por una sesión.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=link", serverConfig.siteUrl));

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isEmailAllowed(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", serverConfig.siteUrl));
  }
  // Base fija (NEXT_PUBLIC_SITE_URL): detrás de proxies request.url puede traer
  // otro host y la cookie de sesión no viajaría.
  return NextResponse.redirect(new URL("/", serverConfig.siteUrl));
}

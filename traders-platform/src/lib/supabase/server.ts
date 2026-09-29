import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverConfig } from "@/lib/config";

/** Cliente con la sesión del usuario (RLS aplica). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(serverConfig.supabaseUrl, serverConfig.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}

/**
 * Cliente con service role: IGNORA RLS. Solo para operaciones de servidor
 * muy concretas (crear usuarios allowlist, webhooks de Stripe, borrado RGPD).
 * Nunca importar desde código de cliente.
 */
export function createSupabaseAdminClient() {
  return createClient(serverConfig.supabaseUrl, serverConfig.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

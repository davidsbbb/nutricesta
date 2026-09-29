import "server-only";
import { adminEmails, assertSafeEnvironment, parseEmailList } from "@/lib/env-guard";

assertSafeEnvironment();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver .env.example)`);
  return v;
}

export const serverConfig = {
  publicLaunch: false as const,
  allowedEmails: parseEmailList(process.env.ALLOWED_EMAILS),
  adminEmails: adminEmails(),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000",
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
};

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return serverConfig.allowedEmails.includes(email.trim().toLowerCase());
}

/** Admin de pruebas: puede cambiar su propio modo para ver todas las vistas. */
export function isTestAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return serverConfig.adminEmails.includes(email.trim().toLowerCase());
}

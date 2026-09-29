import "server-only";
import { assertSafeEnvironment, parseEmailList } from "@/lib/env-guard";

assertSafeEnvironment();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver .env.example)`);
  return v;
}

export const serverConfig = {
  publicLaunch: false as const,
  allowedEmails: parseEmailList(process.env.ALLOWED_EMAILS),
  adminEmail: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
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

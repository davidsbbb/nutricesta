"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmailAllowed, serverConfig } from "@/lib/config";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

const emailSchema = z.string().trim().toLowerCase().email();
const codeSchema = z.string().trim().regex(/^\d{6,10}$/);

const REJECTED =
  "Acceso restringido: este entorno privado solo admite emails invitados.";

/**
 * Crea el usuario (solo si está en la allowlist) con service role, porque el
 * registro público de Supabase está desactivado. Asigna el rol admin a
 * ADMIN_EMAIL.
 */
async function ensureAllowedUser(email: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (error) throw error;
  let user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    // La BD rechaza crear usuarios cuyo email no esté en su propia allowlist.
    const allow = await admin.rpc("server_allow_email", { p_email: email });
    if (allow.error) throw allow.error;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  if (email === serverConfig.adminEmail) {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", user.id)
      .or("role.is.null,role.neq.admin");
    if (roleError) throw roleError;
  }
}

export async function requestLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { step: "email", error: "Introduce un email válido." };
  const email = parsed.data;

  if (!isEmailAllowed(email)) return { step: "email", error: REJECTED };

  try {
    await ensureAllowedUser(email);
  } catch (e) {
    console.error("ensureAllowedUser", e);
    return { step: "email", error: "No se pudo preparar el acceso. Inténtalo de nuevo." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${serverConfig.siteUrl}/auth/callback`,
    },
  });
  if (error) {
    console.error("signInWithOtp", error);
    return { step: "email", error: "No se pudo enviar el email. Espera un minuto e inténtalo." };
  }
  return { step: "code", email };
}

export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const email = parsedEmail.success ? parsedEmail.data : "";
  if (!isEmailAllowed(email)) return { step: "email", error: REJECTED };

  const parsed = codeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { step: "code", email, error: "El código no es válido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: parsed.data, type: "email" });
  if (error) return { step: "code", email, error: "Código incorrecto o caducado." };

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

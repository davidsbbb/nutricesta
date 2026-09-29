import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REGISTRATION_DOCS } from "@/legal/documents";

export type Role = "admin" | "trader" | "suscriptor";

export interface Profile {
  id: string;
  role: Role | null;
  display_name: string;
  onboarded_at: string | null;
}

/** Usuario + perfil de la petición actual (memorizado por petición). */
export const getSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isEmailAllowed(user.email)) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, onboarded_at")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return null;

  const { data: accepted } = await supabase.rpc("has_current_acceptances", {
    p_keys: REGISTRATION_DOCS,
  });

  return { supabase, user, profile, legalUpToDate: accepted === true };
});

/** Exige sesión, onboarding completo y aceptaciones legales vigentes. */
export async function requireOnboardedUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile.onboarded_at || !session.profile.role || !session.legalUpToDate) {
    redirect("/onboarding");
  }
  return session as typeof session & { profile: Profile & { role: Role } };
}

export async function requireRole(...roles: Role[]) {
  const session = await requireOnboardedUser();
  if (!roles.includes(session.profile.role)) redirect("/");
  return session;
}

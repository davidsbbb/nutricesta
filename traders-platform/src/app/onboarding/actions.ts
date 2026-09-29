"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { REGISTRATION_DOCS } from "@/legal/documents";
import { acceptancePayload } from "@/legal/acceptance";

export type OnboardingState = { error?: string };

const schema = z.object({
  display_name: z.string().trim().min(2).max(40),
  role: z.enum(["trader", "suscriptor"]),
});

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await getSession();
  if (!session) redirect("/login");

  // Cada documento requiere su casilla marcada explícitamente (sin premarcar).
  const missing = REGISTRATION_DOCS.filter((k) => formData.get(`accept_${k}`) !== "on");
  if (missing.length > 0) {
    return { error: "Debes aceptar todos los documentos para continuar." };
  }

  const isAdmin = session.profile.role === "admin";
  const parsed = schema.safeParse({
    display_name: formData.get("display_name"),
    role: isAdmin ? "suscriptor" : formData.get("role"), // el rol admin se conserva en BD
  });
  if (!parsed.success) {
    return { error: "Revisa el nombre (2-40 caracteres) y el rol." };
  }

  const { error } = await session.supabase.rpc("complete_onboarding", {
    p_display_name: parsed.data.display_name,
    p_role: parsed.data.role,
    p_docs: acceptancePayload(REGISTRATION_DOCS),
  });
  if (error) {
    console.error("complete_onboarding", error);
    return { error: error.message };
  }
  redirect("/");
}

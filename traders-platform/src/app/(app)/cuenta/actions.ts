"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isTestAdmin } from "@/lib/config";
import { requireOnboardedUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["admin", "trader", "suscriptor"]);

/**
 * SOLO ENTORNO PRIVADO DE PRUEBAS: los emails de ADMIN_EMAILS pueden cambiar
 * su propio modo para ver la app como admin, trader o suscriptor. Se hace con
 * service role (la BD no permite a nadie cambiarse el rol a sí mismo) y el
 * cambio queda en el log de auditoría (trigger de profiles).
 */
export async function switchTestRole(role: string) {
  const { user } = await requireOnboardedUser();
  if (!isTestAdmin(user.email)) redirect("/");
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) redirect("/cuenta");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ role: parsed.data }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  redirect("/");
}

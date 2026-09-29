"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type AdminFormState = { error?: string; ok?: string };

const note = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 1000) : null);

export async function reviewPost(postId: string, approve: boolean, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("admin_review_post", {
    p_id: postId,
    p_approve: approve,
    p_note: note(formData.get("note")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/revision");
}

export async function reviewStatement(statementId: string, approve: boolean, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("admin_review_statement", {
    p_id: statementId,
    p_approve: approve,
    p_note: note(formData.get("note")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/verificaciones");
}

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const settingsSchema = z.object({
  platform_fee_pct: z.coerce.number().min(0).max(100),
  publish_delay_hours: z.coerce.number().int().min(0).max(720),
  banned_terms_mode: z.enum(["block", "review"]),
  banned_terms: z.array(z.string().max(80)).max(200),
  banned_patterns: z
    .array(z.string().max(300))
    .max(50)
    .refine((ps) => ps.every(isValidRegex), "Hay un patrón con sintaxis inválida"),
});

function isValidRegex(p: string) {
  try {
    new RegExp(p);
    return true;
  } catch {
    return false;
  }
}

export async function saveSettings(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const { supabase } = await requireRole("admin");
  const parsed = settingsSchema.safeParse({
    platform_fee_pct: String(formData.get("platform_fee_pct") ?? "").replace(",", "."),
    publish_delay_hours: formData.get("publish_delay_hours"),
    banned_terms_mode: formData.get("banned_terms_mode"),
    banned_terms: lines(formData.get("banned_terms")),
    banned_patterns: lines(formData.get("banned_patterns")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { platform_fee_pct, ...rest } = parsed.data;

  const { error } = await supabase
    .from("platform_settings")
    .update({ ...rest, platform_fee_bps: Math.round(platform_fee_pct * 100) })
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/ajustes");
  return { ok: "Ajustes guardados (queda registrado en la auditoría)." };
}

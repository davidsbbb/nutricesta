"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Actualiza la fila del usuario o la crea si no existe. No usamos upsert:
 * PostgREST incluiría user_id en el UPDATE y el usuario no tiene (ni debe
 * tener) permiso para cambiar esa columna.
 */
async function saveOwnRow(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  values: Record<string, unknown>,
) {
  const updated = await supabase.from(table).update(values).eq("user_id", userId).select("user_id");
  if (updated.error) return updated.error;
  if (updated.data.length > 0) return null;
  const inserted = await supabase.from(table).insert({ user_id: userId, ...values });
  return inserted.error;
}

export type FormState = { error?: string; ok?: string };

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null ? null : Number(String(v).replace(",", "."))),
    z.number().min(min).max(max).nullable(),
  );
const optionalDate = z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable());

const profileSchema = z.object({
  bio: z.string().trim().max(1000),
  strategy: z.string().trim().max(1000),
  markets: z.string().trim().max(200),
  trading_since: optionalDate,
  return_12m_pct: optionalNumber(-100, 10000),
  max_drawdown_pct: optionalNumber(0, 100),
  metrics_as_of: optionalDate,
});

export async function saveTraderProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireRole("trader");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos: " + parsed.error.issues[0]?.message };

  const error = await saveOwnRow(supabase, "trader_profiles", user.id, parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/trader/perfil");
  return { ok: "Perfil guardado." };
}

const taxSchema = z.object({
  tax_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{5,20}$/, "NIF no válido"),
  tax_country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "País: código de 2 letras (ES, PT...)"),
});

export async function saveTaxInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireRole("trader");
  const parsed = taxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const error = await saveOwnRow(supabase, "trader_tax_info", user.id, parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/trader/perfil");
  return { ok: "Datos fiscales guardados." };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type PostFormState = { error?: string };

const assetSchema = z
  .object({
    asset: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9.:\- ]{1,40}$/, "Activo: usa el ticker (p. ej. AAPL, SAN.MC)"),
    view: z.enum(["alcista", "bajista", "neutral"]),
    own_position: z.enum(["ninguna", "larga", "corta"]),
    recent_trade: z.enum(["", "compra", "venta"]).transform((v) => v || null),
    recent_trade_at: z
      .union([z.literal(""), z.iso.datetime()])
      .transform((v) => v || null)
      .refine((v) => v === null || new Date(v) <= new Date(), "La operación no puede ser futura")
      .refine(
        (v) => v === null || Date.now() - new Date(v).getTime() <= 31 * 24 * 3600 * 1000,
        "Solo se declaran operaciones de los últimos 30 días",
      ),
    opposite_intent: z.boolean(),
  })
  .refine((a) => (a.recent_trade === null) === (a.recent_trade_at === null), {
    message: "Si declaras una operación reciente, indica también su fecha (y viceversa)",
  });

const postSchema = z.object({
  kind: z.enum(["cartera", "tesis"]),
  title: z.string().trim().min(5, "Título: mínimo 5 caracteres").max(140),
  body: z.string().trim().min(20, "Contenido: mínimo 20 caracteres").max(20000),
  conflicts: z.string().trim().min(2, "Declara tus conflictos de interés (o escribe «Ninguno»)").max(1000),
  risk_ack: z.literal("on", { message: "Debes aceptar el aviso de riesgos" }),
  positions_ack: z.literal("on", { message: "Confirma que tu declaración de posiciones es veraz" }),
  assets: z.array(assetSchema).min(1, "Declara al menos un activo").max(20),
});

/** Traduce errores de la BD a mensajes legibles. */
function dbMessage(message: string) {
  if (message.includes("sentido contrario") || message.includes("prohibidas")) return message;
  return `No se pudo guardar: ${message}`;
}

export async function createPost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const { supabase } = await requireRole("trader");

  let assets: unknown;
  try {
    assets = JSON.parse(String(formData.get("assets") ?? "[]"));
  } catch {
    return { error: "Activos no válidos" };
  }
  const parsed = postSchema.safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    body: formData.get("body"),
    conflicts: formData.get("conflicts"),
    risk_ack: formData.get("risk_ack"),
    positions_ack: formData.get("positions_ack"),
    assets,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const { data: id, error } = await supabase.rpc("create_post", {
    p_kind: d.kind,
    p_title: d.title,
    p_body: d.body,
    p_conflicts: d.conflicts,
    p_risk_ack: true,
    p_assets: d.assets,
  });
  if (error) return { error: dbMessage(error.message) };

  revalidatePath("/trader/publicaciones");
  redirect(`/publicaciones/${id}`);
}

const editSchema = postSchema.pick({ title: true, body: true, conflicts: true });

export async function editPost(
  postId: string,
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const { supabase } = await requireRole("trader");
  const parsed = editSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    conflicts: formData.get("conflicts"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase.rpc("edit_post", {
    p_id: postId,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_conflicts: parsed.data.conflicts,
  });
  if (error) return { error: dbMessage(error.message) };
  revalidatePath(`/publicaciones/${postId}`);
  redirect(`/publicaciones/${postId}`);
}

export async function withdrawPost(postId: string) {
  const { supabase } = await requireRole("trader", "admin");
  await supabase.rpc("withdraw_post", { p_id: postId });
  revalidatePath(`/publicaciones/${postId}`);
  revalidatePath("/trader/publicaciones");
}

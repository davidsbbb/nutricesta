"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type UploadState = { error?: string; ok?: string };

const MAX_BYTES = 4 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

const schema = z
  .object({ period_start: z.iso.date(), period_end: z.iso.date() })
  .refine((d) => d.period_end >= d.period_start, "El fin del periodo es anterior al inicio");

export async function uploadStatement(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const { supabase, user } = await requireRole("trader");

  const parsed = schema.safeParse({
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Fechas no válidas" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Adjunta un fichero." };
  if (file.size > MAX_BYTES) return { error: "Máximo 4 MB." };
  const ext = MIME_EXT[file.type];
  if (!ext) return { error: "Formato no admitido: PDF, PNG o JPG." };

  // Nombre interno aleatorio: el nombre original solo se guarda como etiqueta.
  const path = `${user.id}/${randomUUID()}.${ext}`;
  const upload = await supabase.storage
    .from("statements")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) return { error: `Error al subir: ${upload.error.message}` };

  const { error } = await supabase.from("track_record_statements").insert({
    trader_id: user.id,
    file_path: path,
    file_name: file.name.slice(0, 200),
    ...parsed.data,
  });
  if (error) return { error: error.message };

  revalidatePath("/trader/verificacion");
  return { ok: "Extracto enviado. El admin lo revisará manualmente." };
}

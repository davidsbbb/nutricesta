import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { EditPostForm } from "./edit-form";

export default async function EditPostPage({ params }: PageProps<"/publicaciones/[id]/editar">) {
  const { id } = await params;
  const { supabase, user } = await requireRole("trader");
  const { data: post } = await supabase
    .from("posts")
    .select("id, title, body, conflicts_of_interest, status")
    .eq("id", id)
    .eq("trader_id", user.id)
    .maybeSingle();
  if (!post || ["retirada", "rechazada"].includes(post.status)) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Editar publicación</h1>
      <Notice tone="slate">
        La versión anterior se conserva y queda registrada. Los activos y posiciones declarados no
        se pueden cambiar: si cambian, crea una publicación nueva.
      </Notice>
      <EditPostForm id={post.id} title={post.title} body={post.body} conflicts={post.conflicts_of_interest} />
    </div>
  );
}

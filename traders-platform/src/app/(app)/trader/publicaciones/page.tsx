import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { buttonCls, cardCls, PostStatusBadge, type PostStatus } from "@/components/ui";

export default async function MyPostsPage() {
  const { supabase, user } = await requireRole("trader");
  const { data: posts } = await supabase
    .from("posts")
    .select("id, kind, title, status, publish_at, submitted_at, flagged_terms")
    .eq("trader_id", user.id)
    .order("submitted_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Mis publicaciones</h1>
        <Link href="/trader/publicaciones/nueva" className={buttonCls}>
          Nueva
        </Link>
      </div>
      {!posts?.length && <p className="text-sm text-slate-500">Aún no has publicado nada.</p>}
      <ul className="space-y-2">
        {posts?.map((p) => (
          <li key={p.id}>
            <Link href={`/publicaciones/${p.id}`} className={`${cardCls} block hover:border-brand`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <PostStatusBadge status={p.status as PostStatus} publishAt={p.publish_at} />
              </div>
              <div className="text-xs text-slate-500">
                {p.kind === "cartera" ? "Cartera" : "Tesis"}
                {p.flagged_terms?.length > 0 && ` · marcada por: ${p.flagged_terms.join(", ")}`}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

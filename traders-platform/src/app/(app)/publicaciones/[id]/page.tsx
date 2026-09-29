import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import {
  cardCls,
  formatDate,
  InvestmentDisclaimer,
  Notice,
  PostStatusBadge,
  secondaryButtonCls,
  type PostStatus,
} from "@/components/ui";
import { withdrawPost } from "@/app/(app)/trader/publicaciones/actions";

const VIEW_LABEL = { alcista: "Alcista", bajista: "Bajista", neutral: "Neutral" } as const;
const POS_LABEL = { ninguna: "Sin posición", larga: "Larga", corta: "Corta" } as const;

export default async function PostPage({ params }: PageProps<"/publicaciones/[id]">) {
  const { id } = await params;
  const { supabase, user, profile } = await requireOnboardedUser();

  // RLS decide: autor, admin, o lector con acceso a publicaciones ya publicadas.
  const { data: post } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (!post) notFound();

  const [{ data: assets }, { data: author }, { count: revisions }] = await Promise.all([
    supabase.from("post_assets").select("*").eq("post_id", id).order("asset"),
    supabase.from("profiles").select("display_name").eq("id", post.trader_id).single(),
    supabase.from("post_revisions").select("id", { count: "exact", head: true }).eq("post_id", id),
  ]);

  const isAuthor = post.trader_id === user.id;
  const editable = isAuthor && !["retirada", "rechazada"].includes(post.status);

  return (
    <article className="space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="uppercase">{post.kind}</span>
          <PostStatusBadge status={post.status as PostStatus} publishAt={post.publish_at} />
          {(revisions ?? 0) > 0 && <span>· editada {revisions} {revisions === 1 ? "vez" : "veces"}</span>}
        </div>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <p className="text-sm text-slate-500">
          Por{" "}
          <Link href={`/traders/${post.trader_id}`} className="underline">
            {author?.display_name}
          </Link>{" "}
          · {formatDate(post.publish_at, true)}
        </p>
      </div>

      <InvestmentDisclaimer />

      {(isAuthor || profile.role === "admin") && post.flagged_terms?.length > 0 && (
        <Notice tone="red">
          Marcada por el filtro: {post.flagged_terms.join(", ")}.
          {post.review_note && ` Nota del admin: ${post.review_note}`}
        </Notice>
      )}

      <div className="whitespace-pre-wrap leading-relaxed">{post.body}</div>

      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">Declaración de posiciones del autor</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-2">Activo</th>
                <th className="py-1 pr-2">Visión</th>
                <th className="py-1 pr-2">Posición</th>
                <th className="py-1">Operación reciente</th>
              </tr>
            </thead>
            <tbody>
              {assets?.map((a) => (
                <tr key={a.asset} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-1 pr-2 font-medium">{a.asset}</td>
                  <td className="py-1 pr-2">{VIEW_LABEL[a.view as keyof typeof VIEW_LABEL]}</td>
                  <td className="py-1 pr-2">{POS_LABEL[a.own_position as keyof typeof POS_LABEL]}</td>
                  <td className="py-1">
                    {a.recent_trade ? `${a.recent_trade} · ${formatDate(a.recent_trade_at)}` : "Ninguna"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-3 text-sm font-semibold">Conflictos de interés</h3>
        <p className="text-sm">{post.conflicts_of_interest}</p>
      </section>

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/publicaciones/${id}/editar`} className={secondaryButtonCls}>
            Editar texto
          </Link>
          <form action={withdrawPost.bind(null, id)}>
            <button className={secondaryButtonCls}>Retirar publicación</button>
          </form>
        </div>
      )}
    </article>
  );
}

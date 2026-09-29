import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { PAST_PERFORMANCE } from "@/legal/documents";
import {
  cardCls,
  formatDate,
  formatPct,
  InvestmentDisclaimer,
  Notice,
  PostStatusBadge,
  VerificationBadge,
  type PostStatus,
  type VerificationStatus,
} from "@/components/ui";

export default async function TraderPage({ params }: PageProps<"/traders/[id]">) {
  const { id } = await params;
  const { supabase } = await requireOnboardedUser();

  const [{ data: traderRow }, { data: person }, { data: canRead }] = await Promise.all([
    supabase.from("trader_profiles").select("*").eq("user_id", id).maybeSingle(),
    supabase.from("profiles").select("display_name, role").eq("id", id).maybeSingle(),
    supabase.rpc("can_read_trader_content", { p_trader: id }),
  ]);
  if (person?.role !== "trader") notFound();
  // Trader que aún no ha rellenado su perfil: se muestra vacío.
  const trader = traderRow ?? {
    verification_status: "pendiente",
    return_12m_pct: null,
    max_drawdown_pct: null,
    trading_since: null,
    metrics_as_of: null,
    bio: "",
    strategy: "",
    markets: "",
  };

  // RLS solo devuelve lo que el usuario puede leer.
  const { data: posts } = await supabase
    .from("posts")
    .select("id, kind, title, status, publish_at")
    .eq("trader_id", id)
    .order("publish_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{person.display_name}</h1>
        <VerificationBadge status={trader.verification_status as VerificationStatus} />
      </div>

      <section className={cardCls}>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Rentabilidad 12 m</dt><dd className="text-lg font-semibold">{formatPct(trader.return_12m_pct)}</dd></div>
          <div><dt className="text-xs text-slate-500">Drawdown máx.</dt><dd className="text-lg font-semibold">{formatPct(trader.max_drawdown_pct)}</dd></div>
          <div><dt className="text-xs text-slate-500">Opera desde</dt><dd className="text-lg font-semibold">{formatDate(trader.trading_since)}</dd></div>
          <div><dt className="text-xs text-slate-500">Métricas a</dt><dd className="text-lg font-semibold">{formatDate(trader.metrics_as_of)}</dd></div>
        </dl>
        <p className="mt-3 text-xs font-semibold text-amber-800 dark:text-amber-300">{PAST_PERFORMANCE}</p>
        <p className="text-xs text-slate-500">
          Métricas declaradas por el trader
          {trader.verification_status === "verificado"
            ? ", contrastadas manualmente con extractos por el admin."
            : ", sin verificar."}
        </p>
      </section>

      {trader.bio && (
        <section><h2 className="font-semibold">Bio</h2><p className="whitespace-pre-wrap text-sm">{trader.bio}</p></section>
      )}
      {trader.strategy && (
        <section><h2 className="font-semibold">Estrategia</h2><p className="whitespace-pre-wrap text-sm">{trader.strategy}</p></section>
      )}
      {trader.markets && (
        <section><h2 className="font-semibold">Mercados</h2><p className="text-sm">{trader.markets}</p></section>
      )}

      <InvestmentDisclaimer />

      <section className="space-y-2">
        <h2 className="font-semibold">Publicaciones</h2>
        {!canRead && (
          <Notice tone="slate">
            El contenido de este trader es solo para sus suscriptores (las suscripciones llegan en la
            fase 3).
          </Notice>
        )}
        {canRead && !posts?.length && <p className="text-sm text-slate-500">Sin publicaciones.</p>}
        <ul className="space-y-2">
          {posts?.map((p) => (
            <li key={p.id}>
              <Link href={`/publicaciones/${p.id}`} className={`${cardCls} block hover:border-brand`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{p.title}</span>
                  <PostStatusBadge status={p.status as PostStatus} publishAt={p.publish_at} />
                </div>
                <div className="text-xs uppercase text-slate-500">{p.kind}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

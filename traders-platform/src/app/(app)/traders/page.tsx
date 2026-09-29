import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import {
  cardCls,
  formatDate,
  formatPct,
  InvestmentDisclaimer,
  VerificationBadge,
  type VerificationStatus,
} from "@/components/ui";

/**
 * Ranking NEUTRO: solo datos objetivos y el orden lo elige el usuario.
 * Nada de "recomendado", "mejor para ti" ni "sigue a este".
 */
const SORTS = {
  nombre: "Nombre (A-Z)",
  antiguedad: "Antigüedad operando",
  rentabilidad: "Rentabilidad 12 m declarada",
  drawdown: "Drawdown máx. (menor primero)",
  publicaciones: "Nº de publicaciones",
} as const;
type Sort = keyof typeof SORTS;

export default async function TradersPage({ searchParams }: PageProps<"/traders">) {
  const { supabase } = await requireOnboardedUser();
  const sp = await searchParams;
  const sort: Sort = typeof sp.orden === "string" && sp.orden in SORTS ? (sp.orden as Sort) : "nombre";

  const [{ data: traders }, { data: names }, { data: stats }] = await Promise.all([
    supabase.from("trader_profiles").select("*"),
    supabase.from("profiles").select("id, display_name").eq("role", "trader"),
    supabase.rpc("trader_public_stats"),
  ]);

  const rows = (traders ?? []).map((t) => ({
    ...t,
    name: names?.find((n) => n.id === t.user_id)?.display_name ?? "—",
    posts: Number(stats?.find((s: { trader_id: string }) => s.trader_id === t.user_id)?.published_posts ?? 0),
  }));

  // Valores ausentes siempre al final, sea cual sea el orden.
  const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) =>
    a === null ? 1 : b === null ? -1 : (a - b) * dir;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  rows.sort((a, b) => {
    switch (sort) {
      case "antiguedad":
        return nullsLast(num(a.trading_since && Date.parse(a.trading_since)), num(b.trading_since && Date.parse(b.trading_since)), 1);
      case "rentabilidad":
        return nullsLast(num(a.return_12m_pct), num(b.return_12m_pct), -1);
      case "drawdown":
        return nullsLast(num(a.max_drawdown_pct), num(b.max_drawdown_pct), 1);
      case "publicaciones":
        return b.posts - a.posts;
      default:
        return a.name.localeCompare(b.name, "es");
    }
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Traders</h1>
      <InvestmentDisclaimer />

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="orden">Ordenar por</label>
        <select id="orden" name="orden" defaultValue={sort} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
          {Object.entries(SORTS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <button className="underline">Aplicar</button>
      </form>
      <p className="text-xs text-slate-500">
        El orden solo refleja el dato elegido. Las métricas las declara cada trader; mira su estado de
        verificación. No es una recomendación.
      </p>

      {!rows.length && <p className="text-sm text-slate-500">Todavía no hay traders con perfil.</p>}
      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.user_id}>
            <Link href={`/traders/${t.user_id}`} className={`${cardCls} block hover:border-brand`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{t.name}</strong>
                <VerificationBadge status={t.verification_status as VerificationStatus} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs sm:grid-cols-4">
                <div><dt className="text-slate-500">Rent. 12 m</dt><dd>{formatPct(t.return_12m_pct)}</dd></div>
                <div><dt className="text-slate-500">Drawdown máx.</dt><dd>{formatPct(t.max_drawdown_pct)}</dd></div>
                <div><dt className="text-slate-500">Opera desde</dt><dd>{formatDate(t.trading_since)}</dd></div>
                <div><dt className="text-slate-500">Publicaciones</dt><dd>{t.posts}</dd></div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

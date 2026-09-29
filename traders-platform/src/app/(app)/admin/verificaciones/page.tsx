import { requireRole } from "@/lib/auth";
import {
  buttonCls,
  cardCls,
  formatDate,
  formatPct,
  inputCls,
  secondaryButtonCls,
  VerificationBadge,
  type VerificationStatus,
} from "@/components/ui";
import { reviewStatement } from "../actions";

export default async function VerificationsPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: statements }, { data: names }, { data: traders }] = await Promise.all([
    supabase.from("track_record_statements").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, display_name"),
    supabase.from("trader_profiles").select("user_id, return_12m_pct, max_drawdown_pct, trading_since, metrics_as_of"),
  ]);

  // Enlaces temporales (10 min) para ver los ficheros privados.
  const signed = new Map<string, string>();
  if (statements?.length) {
    const { data } = await supabase.storage
      .from("statements")
      .createSignedUrls(statements.map((s) => s.file_path), 600);
    data?.forEach((d) => d.path && d.signedUrl && signed.set(d.path, d.signedUrl));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Verificación de track record</h1>
      <p className="text-sm text-slate-500">
        Compara el extracto con las métricas declaradas antes de aprobar. La aprobación marca el
        perfil como verificado; si el trader cambia después sus métricas, vuelve a pendiente.
      </p>
      {!statements?.length && <p className="text-sm">No hay extractos.</p>}
      <ul className="space-y-3">
        {statements?.map((s) => {
          const t = traders?.find((x) => x.user_id === s.trader_id);
          return (
            <li key={s.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{names?.find((n) => n.id === s.trader_id)?.display_name}</strong>
                <VerificationBadge status={s.status as VerificationStatus} />
              </div>
              <div className="text-xs text-slate-500">
                {s.file_name} · periodo {formatDate(s.period_start)} – {formatDate(s.period_end)} · enviado{" "}
                {formatDate(s.created_at, true)}
              </div>
              <div className="mt-1 text-xs">
                Declarado: rent. 12 m {formatPct(t?.return_12m_pct)}, drawdown {formatPct(t?.max_drawdown_pct)},
                desde {formatDate(t?.trading_since)}, a {formatDate(t?.metrics_as_of)}
              </div>
              {signed.get(s.file_path) && (
                <a href={signed.get(s.file_path)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm underline">
                  Abrir extracto
                </a>
              )}
              {s.status === "pendiente" ? (
                <form className="mt-3 space-y-2">
                  <input name="note" placeholder="Nota (opcional)" className={inputCls} />
                  <div className="flex gap-2">
                    <button formAction={reviewStatement.bind(null, s.id, true)} className={buttonCls}>Verificar</button>
                    <button formAction={reviewStatement.bind(null, s.id, false)} className={secondaryButtonCls}>Rechazar</button>
                  </div>
                </form>
              ) : (
                s.review_note && <p className="mt-1 text-xs">Nota: {s.review_note}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

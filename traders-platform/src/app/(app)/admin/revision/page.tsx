import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { buttonCls, cardCls, formatDate, inputCls, secondaryButtonCls } from "@/components/ui";
import { reviewPost } from "../actions";

export default async function ReviewQueuePage() {
  const { supabase } = await requireRole("admin");
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, body, flagged_terms, submitted_at, trader_id")
    .eq("status", "en_revision")
    .order("submitted_at");
  const { data: names } = await supabase.from("profiles").select("id, display_name");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Publicaciones en revisión</h1>
      <p className="text-sm text-slate-500">
        Retenidas por el filtro de expresiones prohibidas. Al aprobar, se publican cuando se cumpla
        su retraso mínimo (o al momento si ya pasó).
      </p>
      {!posts?.length && <p className="text-sm">No hay nada pendiente.</p>}
      <ul className="space-y-3">
        {posts?.map((p) => (
          <li key={p.id} className={cardCls}>
            <Link href={`/publicaciones/${p.id}`} className="font-medium underline">{p.title}</Link>
            <div className="text-xs text-slate-500">
              {names?.find((n) => n.id === p.trader_id)?.display_name} · {formatDate(p.submitted_at, true)}
            </div>
            <div className="mt-1 text-sm text-red-700 dark:text-red-400">
              Detectado: {p.flagged_terms.join(", ")}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm">{p.body}</p>
            <form className="mt-3 space-y-2">
              <input name="note" placeholder="Nota para el trader (opcional)" className={inputCls} />
              <div className="flex gap-2">
                <button formAction={reviewPost.bind(null, p.id, true)} className={buttonCls}>Aprobar</button>
                <button formAction={reviewPost.bind(null, p.id, false)} className={secondaryButtonCls}>Rechazar</button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

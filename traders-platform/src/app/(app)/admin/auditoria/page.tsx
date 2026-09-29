import { requireRole } from "@/lib/auth";

export default async function AuditPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: rows }, { data: brokenAt }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, occurred_at, actor_id, action, entity_type, entity_id, hash")
      .order("id", { ascending: false })
      .limit(200),
    supabase.rpc("verify_audit_chain"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Log de auditoría</h1>
      <p
        className={`rounded p-2 text-sm ${
          brokenAt == null
            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-red-100 text-red-900"
        }`}
      >
        {brokenAt == null
          ? "Cadena de hashes íntegra."
          : `¡Cadena rota en la entrada #${brokenAt}! Posible manipulación.`}
      </p>
      <ul className="space-y-2 text-xs">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="rounded border border-slate-200 p-2 dark:border-slate-800">
            <div className="flex justify-between gap-2">
              <strong>
                #{r.id} {r.action} · {r.entity_type}
              </strong>
              <span>{new Date(r.occurred_at).toLocaleString("es-ES")}</span>
            </div>
            <div className="truncate text-slate-500">
              actor {r.actor_id ?? "sistema"} · entidad {r.entity_id ?? "-"} · {r.hash.slice(0, 12)}…
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

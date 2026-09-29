import { requireOnboardedUser } from "@/lib/auth";
import { LEGAL_DOCUMENTS, type LegalKey } from "@/legal/documents";

export default async function AccountPage() {
  const { supabase, user, profile } = await requireOnboardedUser();
  const { data: acceptances } = await supabase
    .from("legal_acceptances")
    .select("doc_key, doc_version, context, accepted_at")
    .eq("user_id", user.id)
    .order("accepted_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mi cuenta</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">Email</dt>
        <dd className="truncate">{user.email}</dd>
        <dt className="text-slate-500">Nombre</dt>
        <dd>{profile.display_name}</dd>
        <dt className="text-slate-500">Rol</dt>
        <dd>{profile.role}</dd>
      </dl>

      <section>
        <h2 className="mb-2 font-semibold">Aceptaciones legales registradas</h2>
        <ul className="space-y-1 text-sm">
          {(acceptances ?? []).map((a, i) => (
            <li key={i} className="rounded border border-slate-200 p-2 dark:border-slate-800">
              {LEGAL_DOCUMENTS[a.doc_key as LegalKey]?.title ?? a.doc_key} · v{a.doc_version} ·{" "}
              {a.context} · {new Date(a.accepted_at).toLocaleString("es-ES")}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-slate-500">
        Exportar y borrar tus datos (RGPD) estará disponible en la fase 4.
      </p>
    </div>
  );
}

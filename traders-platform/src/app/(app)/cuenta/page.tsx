import { requireOnboardedUser, type Role } from "@/lib/auth";
import { isTestAdmin } from "@/lib/config";
import { buttonCls, cardCls, secondaryButtonCls } from "@/components/ui";
import { switchTestRole } from "./actions";
import { LEGAL_DOCUMENTS, type LegalKey } from "@/legal/documents";

const MODES: { role: Role; label: string; text: string }[] = [
  { role: "admin", label: "Admin", text: "Revisión, verificaciones, ajustes y auditoría." },
  { role: "trader", label: "Trader", text: "Perfil, verificación y publicaciones." },
  { role: "suscriptor", label: "Suscriptor", text: "La app tal y como la ve un cliente." },
];

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

      {isTestAdmin(user.email) && (
        <section id="modo" className={cardCls}>
          <h2 className="font-semibold">Modo de prueba</h2>
          <p className="mb-3 text-xs text-slate-500">
            Solo en este entorno privado: cambia de modo para ver la app como cada tipo de usuario.
            Tus datos de cada modo se conservan. Queda registrado en la auditoría.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <form key={m.role} action={switchTestRole.bind(null, m.role)}>
                <button
                  disabled={profile.role === m.role}
                  className={`w-full text-left ${profile.role === m.role ? buttonCls : secondaryButtonCls}`}
                >
                  <span className="block">
                    {m.label}
                    {profile.role === m.role && " (actual)"}
                  </span>
                  <span className="block text-xs font-normal opacity-80">{m.text}</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
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

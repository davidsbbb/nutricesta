import Link from "next/link";
import { requireOnboardedUser, type Role } from "@/lib/auth";
import { cardCls, InvestmentDisclaimer } from "@/components/ui";

const SHORTCUTS: Record<Role, { href: string; title: string; text: string }[]> = {
  suscriptor: [
    { href: "/traders", title: "Traders", text: "Consulta perfiles, métricas y estado de verificación." },
  ],
  trader: [
    { href: "/trader/publicaciones/nueva", title: "Nueva publicación", text: "Tesis o cartera general, con tus declaraciones." },
    { href: "/trader/perfil", title: "Mi perfil", text: "Bio, estrategia, métricas y datos fiscales." },
    { href: "/trader/verificacion", title: "Verificación", text: "Sube extractos para verificar tu track record." },
  ],
  admin: [
    { href: "/admin/revision", title: "Revisión", text: "Publicaciones retenidas por el filtro." },
    { href: "/admin/verificaciones", title: "Verificaciones", text: "Extractos pendientes de aprobar." },
    { href: "/admin/ajustes", title: "Ajustes", text: "Comisión, retraso mínimo y palabras prohibidas." },
    { href: "/admin/auditoria", title: "Auditoría", text: "Registro inmutable de todo lo que pasa." },
  ],
};

export default async function HomePage() {
  const { supabase, profile } = await requireOnboardedUser();

  let pending: string | null = null;
  if (profile.role === "admin") {
    const [{ count: posts }, { count: statements }] = await Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "en_revision"),
      supabase.from("track_record_statements").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
    ]);
    pending = `${posts ?? 0} publicaciones en revisión · ${statements ?? 0} extractos pendientes`;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hola, {profile.display_name}</h1>
      <InvestmentDisclaimer />
      {pending && <p className="text-sm font-medium">{pending}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {SHORTCUTS[profile.role].map((s) => (
          <li key={s.href}>
            <Link href={s.href} className={`${cardCls} block h-full hover:border-brand`}>
              <strong>{s.title}</strong>
              <p className="text-sm text-slate-500">{s.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

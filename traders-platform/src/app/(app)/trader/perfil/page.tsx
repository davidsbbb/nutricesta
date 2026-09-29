import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { cardCls, Notice, VerificationBadge, type VerificationStatus } from "@/components/ui";
import { TaxInfoForm, TraderProfileForm, type TraderProfileValues } from "./forms";

export default async function TraderProfilePage() {
  const { supabase, user } = await requireRole("trader");
  const [{ data: profile }, { data: tax }] = await Promise.all([
    supabase.from("trader_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("trader_tax_info").select("tax_id, tax_country").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Mi perfil de trader</h1>
        <Link href={`/traders/${user.id}`} className="text-sm underline">
          Ver perfil público
        </Link>
      </div>

      <section className={cardCls}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <VerificationBadge status={(profile?.verification_status ?? "pendiente") as VerificationStatus} />
          {profile?.verification_note && (
            <span className="text-xs text-slate-500">{profile.verification_note}</span>
          )}
        </div>
        <TraderProfileForm values={profile as TraderProfileValues | null} />
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">Datos fiscales (DAC7)</h2>
        <Notice tone="slate">
          Solo los ves tú y el admin. Se pedirán para cumplir la directiva DAC7 si la plataforma
          abre al público. En este entorno de pruebas puedes usar un NIF ficticio.
        </Notice>
        <div className="mt-3">
          <TaxInfoForm values={tax} />
        </div>
      </section>
    </div>
  );
}

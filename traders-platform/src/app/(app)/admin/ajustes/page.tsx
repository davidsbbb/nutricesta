import { requireRole } from "@/lib/auth";
import { cardCls, formatDate } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const { data: s } = await supabase.from("platform_settings").select("*").single();
  if (!s) return <p>No se pudieron cargar los ajustes.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ajustes de la plataforma</h1>
      <p className="text-xs text-slate-500">Última modificación: {formatDate(s.updated_at, true)}</p>
      <section className={cardCls}>
        <SettingsForm
          feePct={s.platform_fee_bps / 100}
          delayHours={s.publish_delay_hours}
          mode={s.banned_terms_mode}
          terms={s.banned_terms}
          patterns={s.banned_patterns}
        />
      </section>
    </div>
  );
}

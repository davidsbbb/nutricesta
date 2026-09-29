import { requireRole } from "@/lib/auth";
import {
  cardCls,
  formatDate,
  Notice,
  VerificationBadge,
  type VerificationStatus,
} from "@/components/ui";
import { UploadStatementForm } from "./upload-form";

export default async function VerificationPage() {
  const { supabase, user } = await requireRole("trader");
  const { data: statements } = await supabase
    .from("track_record_statements")
    .select("id, file_name, period_start, period_end, status, review_note, created_at")
    .eq("trader_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Verificación del track record</h1>
      <Notice tone="slate">
        Sube extractos de tu bróker que respalden tus métricas. El admin los revisa a mano y marca
        tu perfil como verificado o rechazado. No se conecta con ningún bróker.{" "}
        <strong>Entorno de pruebas: tapa o usa datos ficticios, no subas extractos reales.</strong>
      </Notice>

      <section className={cardCls}>
        <UploadStatementForm />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Extractos enviados</h2>
        {!statements?.length && <p className="text-sm text-slate-500">Todavía no has enviado ninguno.</p>}
        <ul className="space-y-2">
          {statements?.map((s) => (
            <li key={s.id} className={`${cardCls} text-sm`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-medium">{s.file_name}</span>
                <VerificationBadge status={s.status as VerificationStatus} />
              </div>
              <div className="text-xs text-slate-500">
                Periodo {formatDate(s.period_start)} – {formatDate(s.period_end)} · enviado{" "}
                {formatDate(s.created_at, true)}
              </div>
              {s.review_note && <div className="mt-1 text-xs">Nota del admin: {s.review_note}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

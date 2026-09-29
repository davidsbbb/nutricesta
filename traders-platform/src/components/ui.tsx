import { NOT_ADVICE, PAST_PERFORMANCE } from "@/legal/documents";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
export const labelCls = "mb-1 block text-sm font-medium";
export const buttonCls =
  "rounded-lg bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-50";
export const secondaryButtonCls =
  "rounded-lg border border-slate-300 px-4 py-2.5 font-semibold dark:border-slate-600";
export const cardCls =
  "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export const RISK_WARNING =
  "Invertir conlleva riesgos, incluida la pérdida total del capital. Este contenido es general, igual para todos los suscriptores y no tiene en cuenta tu situación personal.";

export function Notice({
  children,
  tone = "amber",
}: {
  children: React.ReactNode;
  tone?: "amber" | "red" | "green" | "slate";
}) {
  const tones = {
    amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
    red: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
    green: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    slate: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  };
  return <div className={`rounded-lg border p-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function InvestmentDisclaimer() {
  return (
    <Notice>
      <strong>{NOT_ADVICE}</strong> {PAST_PERFORMANCE} {RISK_WARNING}
    </Notice>
  );
}

const VERIFICATION = {
  pendiente: ["Track record pendiente de verificar", "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"],
  verificado: ["Track record verificado (revisión manual)", "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"],
  rechazado: ["Verificación rechazada", "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"],
} as const;

export type VerificationStatus = keyof typeof VERIFICATION;

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const [label, cls] = VERIFICATION[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (ok) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{ok}</p>;
  return null;
}

export function formatPct(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return `${Number(v).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

export function formatDate(v: string | null | undefined, withTime = false) {
  if (!v) return "—";
  const d = new Date(v);
  return withTime
    ? d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" })
    : d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
}

export type PostStatus = "en_revision" | "programada" | "rechazada" | "retirada";

/** Estado visible: "programada" ya pasada su hora de publicación = publicada. */
export function PostStatusBadge({ status, publishAt }: { status: PostStatus; publishAt: string }) {
  const live = status === "programada" && new Date(publishAt) <= new Date();
  const [label, cls] = live
    ? ["Publicada", "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"]
    : {
        programada: [`Programada · ${formatDate(publishAt, true)}`, "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100"],
        en_revision: ["En revisión del admin", "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"],
        rechazada: ["Rechazada", "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"],
        retirada: ["Retirada", "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"],
      }[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

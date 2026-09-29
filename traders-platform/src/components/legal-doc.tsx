import { PENDING_REVIEW, type LegalDocument } from "@/legal/documents";

export function PendingReviewBadge() {
  return (
    <span className="inline-block rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
      {PENDING_REVIEW}
    </span>
  );
}

export function LegalDocBody({ doc }: { doc: LegalDocument }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <PendingReviewBadge />
      <p className="text-xs text-slate-500">Versión {doc.version}</p>
      {doc.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

/** Documento plegable con su casilla de aceptación (nunca premarcada). */
export function LegalAcceptItem({ doc }: { doc: LegalDocument }) {
  return (
    <div className="rounded-lg border border-slate-300 p-3 dark:border-slate-700">
      <details>
        <summary className="cursor-pointer font-medium">{doc.title}</summary>
        <div className="mt-3">
          <LegalDocBody doc={doc} />
        </div>
      </details>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" name={`accept_${doc.key}`} required className="mt-1 h-5 w-5 shrink-0" />
        <span>{doc.checkboxLabel}</span>
      </label>
    </div>
  );
}

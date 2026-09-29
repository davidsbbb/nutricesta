"use client";

import { useActionState } from "react";
import { buttonCls, FormMessage, inputCls, labelCls } from "@/components/ui";
import { saveSettings, type AdminFormState } from "../actions";

export function SettingsForm(props: {
  feePct: number;
  delayHours: number;
  mode: "block" | "review";
  terms: string[];
  patterns: string[];
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveSettings, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="platform_fee_pct">Comisión plataforma (%)</label>
          <input id="platform_fee_pct" name="platform_fee_pct" inputMode="decimal" defaultValue={props.feePct} className={inputCls} />
          <p className="mt-1 text-xs text-slate-500">Trader recibe el {100 - props.feePct} %.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="publish_delay_hours">Retraso mínimo (horas)</label>
          <input id="publish_delay_hours" name="publish_delay_hours" type="number" min={0} max={720} defaultValue={props.delayHours} className={inputCls} />
        </div>
      </div>
      <fieldset>
        <legend className={labelCls}>Si una publicación contiene expresiones prohibidas</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="banned_terms_mode" value="review" defaultChecked={props.mode === "review"} className="h-5 w-5" />
          Retener para revisión del admin
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="banned_terms_mode" value="block" defaultChecked={props.mode === "block"} className="h-5 w-5" />
          Bloquear directamente
        </label>
      </fieldset>
      <div>
        <label className={labelCls} htmlFor="banned_terms">Palabras / frases prohibidas (una por línea)</label>
        <textarea id="banned_terms" name="banned_terms" rows={8} defaultValue={props.terms.join("\n")} className={inputCls} />
        <p className="mt-1 text-xs text-slate-500">No distingue mayúsculas ni tildes.</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="banned_patterns">Patrones de promesas de rentabilidad (expresiones regulares, una por línea)</label>
        <textarea id="banned_patterns" name="banned_patterns" rows={6} defaultValue={props.patterns.join("\n")} className={`${inputCls} font-mono text-xs`} />
        <p className="mt-1 text-xs text-slate-500">Se aplican sobre el texto en minúsculas y sin tildes.</p>
      </div>
      <FormMessage {...state} />
      <button className={buttonCls} disabled={pending}>{pending ? "Guardando…" : "Guardar ajustes"}</button>
    </form>
  );
}

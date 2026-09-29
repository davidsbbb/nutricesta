"use client";

import { useActionState } from "react";
import type { LegalDocument } from "@/legal/documents";
import type { Role } from "@/lib/auth";
import { LegalAcceptItem } from "@/components/legal-doc";
import { completeOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({
  isAdmin,
  fixedRole,
  defaultName,
  docs,
}: {
  isAdmin: boolean;
  fixedRole: Role | null;
  defaultName: string;
  docs: LegalDocument[];
}) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );

  return (
    <form action={action} className="space-y-6">
      <div>
        <label htmlFor="display_name" className="mb-1 block text-sm font-medium">
          Nombre visible (no uses tu nombre real si no quieres)
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={defaultName}
          minLength={2}
          maxLength={40}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {isAdmin ? (
        <p className="text-sm">
          Rol: <strong>admin</strong> (asignado por configuración).
        </p>
      ) : fixedRole ? (
        <>
          <input type="hidden" name="role" value={fixedRole} />
          <p className="text-sm">
            Rol: <strong>{fixedRole}</strong>
          </p>
        </>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">¿Cómo vas a usar la plataforma?</legend>
          {[
            ["suscriptor", "Suscriptor", "Leo el contenido general publicado por traders."],
            ["trader", "Trader", "Publico carteras y tesis generales para mis suscriptores."],
          ].map(([value, label, help]) => (
            <label
              key={value}
              className="flex items-start gap-3 rounded-lg border border-slate-300 p-3 dark:border-slate-700"
            >
              <input type="radio" name="role" value={value} required className="mt-1 h-5 w-5" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-slate-500">{help}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-slate-500">El rol no se puede cambiar después sin el admin.</p>
        </fieldset>
      )}

      <div className="space-y-3">
        {docs.map((doc) => (
          <LegalAcceptItem key={doc.key} doc={doc} />
        ))}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {pending ? "Guardando…" : "Aceptar y continuar"}
      </button>
    </form>
  );
}

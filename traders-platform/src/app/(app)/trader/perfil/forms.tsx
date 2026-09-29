"use client";

import { useActionState } from "react";
import { buttonCls, FormMessage, inputCls, labelCls } from "@/components/ui";
import { saveTaxInfo, saveTraderProfile, type FormState } from "./actions";

export interface TraderProfileValues {
  bio: string;
  strategy: string;
  markets: string;
  trading_since: string | null;
  return_12m_pct: number | null;
  max_drawdown_pct: number | null;
  metrics_as_of: string | null;
}

export function TraderProfileForm({ values }: { values: TraderProfileValues | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTraderProfile, {});
  const v = values;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="bio">Bio</label>
        <textarea id="bio" name="bio" rows={3} maxLength={1000} defaultValue={v?.bio} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="strategy">Estrategia</label>
        <textarea id="strategy" name="strategy" rows={3} maxLength={1000} defaultValue={v?.strategy} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="markets">Mercados (p. ej. acciones EE. UU., ETFs)</label>
        <input id="markets" name="markets" maxLength={200} defaultValue={v?.markets} className={inputCls} />
      </div>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 mb-1 text-sm font-medium">
          Métricas (declaradas; cambiarlas anula la verificación)
        </legend>
        <div>
          <label className={labelCls} htmlFor="return_12m_pct">Rentabilidad 12 m (%)</label>
          <input id="return_12m_pct" name="return_12m_pct" inputMode="decimal" defaultValue={v?.return_12m_pct ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="max_drawdown_pct">Drawdown máx. (%)</label>
          <input id="max_drawdown_pct" name="max_drawdown_pct" inputMode="decimal" defaultValue={v?.max_drawdown_pct ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="trading_since">Opera desde</label>
          <input id="trading_since" name="trading_since" type="date" defaultValue={v?.trading_since ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="metrics_as_of">Métricas a fecha</label>
          <input id="metrics_as_of" name="metrics_as_of" type="date" defaultValue={v?.metrics_as_of ?? ""} className={inputCls} />
        </div>
      </fieldset>
      <FormMessage {...state} />
      <button className={buttonCls} disabled={pending}>{pending ? "Guardando…" : "Guardar perfil"}</button>
    </form>
  );
}

export function TaxInfoForm({ values }: { values: { tax_id: string; tax_country: string } | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTaxInfo, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div>
          <label className={labelCls} htmlFor="tax_id">NIF / Tax ID</label>
          <input id="tax_id" name="tax_id" required defaultValue={values?.tax_id} className={inputCls} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor="tax_country">País</label>
          <input id="tax_country" name="tax_country" required maxLength={2} placeholder="ES" defaultValue={values?.tax_country} className={inputCls} />
        </div>
      </div>
      <FormMessage {...state} />
      <button className={buttonCls} disabled={pending}>{pending ? "Guardando…" : "Guardar datos fiscales"}</button>
    </form>
  );
}

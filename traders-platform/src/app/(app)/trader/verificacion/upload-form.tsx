"use client";

import { useActionState } from "react";
import { buttonCls, FormMessage, inputCls, labelCls } from "@/components/ui";
import { uploadStatement, type UploadState } from "./actions";

export function UploadStatementForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadStatement, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="file">Extracto del bróker (PDF, PNG o JPG, máx. 4 MB)</label>
        <input id="file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className="block w-full text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="period_start">Periodo desde</label>
          <input id="period_start" name="period_start" type="date" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="period_end">hasta</label>
          <input id="period_end" name="period_end" type="date" required className={inputCls} />
        </div>
      </div>
      <FormMessage {...state} />
      <button className={buttonCls} disabled={pending}>{pending ? "Subiendo…" : "Enviar para verificación"}</button>
    </form>
  );
}

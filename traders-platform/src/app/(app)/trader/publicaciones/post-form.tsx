"use client";

import { useActionState, useMemo, useState } from "react";
import {
  buttonCls,
  FormMessage,
  inputCls,
  labelCls,
  Notice,
  RISK_WARNING,
  secondaryButtonCls,
} from "@/components/ui";
import { findBannedTerms } from "@/lib/banned-terms";
import { createPost, type PostFormState } from "./actions";

type View = "alcista" | "bajista" | "neutral";
type Position = "ninguna" | "larga" | "corta";
type Side = "" | "compra" | "venta";

interface AssetRow {
  asset: string;
  view: View;
  own_position: Position;
  recent_trade: Side;
  recent_trade_at: string;
  opposite_intent: boolean;
}

const emptyRow: AssetRow = {
  asset: "",
  view: "alcista",
  own_position: "ninguna",
  recent_trade: "",
  recent_trade_at: "",
  opposite_intent: false,
};

/** Misma regla que create_post() en la BD. */
function isOpposite(a: AssetRow) {
  return (
    a.opposite_intent ||
    (a.view === "alcista" && (a.own_position === "corta" || a.recent_trade === "venta")) ||
    (a.view === "bajista" && (a.own_position === "larga" || a.recent_trade === "compra"))
  );
}

export function NewPostForm({
  bannedTerms,
  bannedPatterns,
  mode,
  delayHours,
}: {
  bannedTerms: string[];
  bannedPatterns: string[];
  mode: "block" | "review";
  delayHours: number;
}) {
  const [state, action, pending] = useActionState<PostFormState, FormData>(createPost, {});
  const [rows, setRows] = useState<AssetRow[]>([{ ...emptyRow }]);
  const [text, setText] = useState({ title: "", body: "", conflicts: "" });

  const flagged = useMemo(
    () =>
      findBannedTerms(`${text.title} ${text.body} ${text.conflicts}`, bannedTerms, bannedPatterns),
    [text, bannedTerms, bannedPatterns],
  );
  const opposite = rows.filter((r) => r.asset && isOpposite(r)).map((r) => r.asset.toUpperCase());

  const update = (i: number, patch: Partial<AssetRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-5">
      <input
        type="hidden"
        name="assets"
        value={JSON.stringify(
          // La fecha se envía en ISO con zona horaria (la del navegador del trader).
          rows.map((r) => ({
            ...r,
            recent_trade_at: r.recent_trade_at ? new Date(r.recent_trade_at).toISOString() : "",
          })),
        )}
      />

      <fieldset className="flex gap-4">
        <legend className={labelCls}>Tipo</legend>
        {(["tesis", "cartera"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="kind" value={k} defaultChecked={k === "tesis"} className="h-5 w-5" />
            {k === "tesis" ? "Tesis" : "Cartera"}
          </label>
        ))}
      </fieldset>

      <div>
        <label className={labelCls} htmlFor="title">Título</label>
        <input id="title" name="title" required minLength={5} maxLength={140} className={inputCls}
          onChange={(e) => setText((t) => ({ ...t, title: e.target.value }))} />
      </div>
      <div>
        <label className={labelCls} htmlFor="body">Contenido (general, igual para todos)</label>
        <textarea id="body" name="body" required minLength={20} rows={8} className={inputCls}
          onChange={(e) => setText((t) => ({ ...t, body: e.target.value }))} />
        <p className="mt-1 text-xs text-slate-500">
          No hagas recomendaciones personalizadas ni prometas rentabilidades.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Activos mencionados y tus posiciones</h2>
        <p className="text-xs text-slate-500">
          Declara cada activo que menciones, tu visión y tu posición propia. Si has operado o vas a
          operar en sentido contrario a lo que publicas, no se permite publicar.
        </p>
        {rows.map((r, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-300 p-3 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex gap-2">
                <input aria-label="Ticker" placeholder="Ticker (AAPL, SAN.MC…)" value={r.asset} required
                  onChange={(e) => update(i, { asset: e.target.value })} className={inputCls} />
                {rows.length > 1 && (
                  <button type="button" className={secondaryButtonCls} aria-label="Quitar activo"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
              <label className="text-xs">Tu visión
                <select value={r.view} onChange={(e) => update(i, { view: e.target.value as View })} className={inputCls}>
                  <option value="alcista">Alcista</option>
                  <option value="bajista">Bajista</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label className="text-xs">Tu posición actual
                <select value={r.own_position} onChange={(e) => update(i, { own_position: e.target.value as Position })} className={inputCls}>
                  <option value="ninguna">Sin posición</option>
                  <option value="larga">Larga (comprado)</option>
                  <option value="corta">Corta (vendido)</option>
                </select>
              </label>
              <label className="text-xs">Operación en los últimos 30 días
                <select value={r.recent_trade} onChange={(e) => update(i, { recent_trade: e.target.value as Side })} className={inputCls}>
                  <option value="">Ninguna</option>
                  <option value="compra">Compra</option>
                  <option value="venta">Venta</option>
                </select>
              </label>
              {r.recent_trade && (
                <label className="text-xs">Fecha de la operación
                  <input type="datetime-local" required value={r.recent_trade_at}
                    onChange={(e) => update(i, { recent_trade_at: e.target.value })} className={inputCls} />
                </label>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={r.opposite_intent} className="mt-1 h-5 w-5"
                onChange={(e) => update(i, { opposite_intent: e.target.checked })} />
              Tengo intención de operar en sentido contrario a esta publicación en este activo
            </label>
          </div>
        ))}
        {rows.length < 20 && (
          <button type="button" className={secondaryButtonCls} onClick={() => setRows((rs) => [...rs, { ...emptyRow }])}>
            + Añadir activo
          </button>
        )}
      </section>

      <div>
        <label className={labelCls} htmlFor="conflicts">Conflictos de interés</label>
        <textarea id="conflicts" name="conflicts" required rows={2} className={inputCls}
          placeholder="Relación con emisores, cobros de terceros, afiliaciones… o «Ninguno»"
          onChange={(e) => setText((t) => ({ ...t, conflicts: e.target.value }))} />
      </div>

      <Notice>{RISK_WARNING} Este aviso se mostrará junto a tu publicación.</Notice>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="risk_ack" required className="mt-1 h-5 w-5" />
        Acepto incluir el aviso de riesgos y confirmo que el contenido es general, no personalizado.
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="positions_ack" required className="mt-1 h-5 w-5" />
        Declaro que mis posiciones y conflictos de interés indicados son veraces y completos.
      </label>

      {opposite.length > 0 && (
        <Notice tone="red">
          Publicación bloqueada: has operado o vas a operar en sentido contrario en{" "}
          <strong>{opposite.join(", ")}</strong>.
        </Notice>
      )}
      {flagged.length > 0 && (
        <Notice tone="red">
          Expresiones no permitidas: <strong>{flagged.join(", ")}</strong>.{" "}
          {mode === "block"
            ? "La publicación será bloqueada."
            : "La publicación quedará retenida para revisión del admin."}
        </Notice>
      )}
      <p className="text-xs text-slate-500">
        Se publicará automáticamente {delayHours} h después de enviarla (retraso mínimo obligatorio).
      </p>

      <FormMessage error={state.error} />
      <button className={`${buttonCls} w-full`} disabled={pending || opposite.length > 0}>
        {pending ? "Enviando…" : "Enviar publicación"}
      </button>
    </form>
  );
}

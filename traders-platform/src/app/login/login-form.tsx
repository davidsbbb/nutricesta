"use client";

import { useActionState } from "react";
import { requestLoginCode, verifyLoginCode, type LoginState } from "./actions";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const button =
  "w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [emailState, sendCode, sending] = useActionState<LoginState, FormData>(requestLoginCode, {
    step: "email",
    error: initialError,
  });
  const [codeState, checkCode, checking] = useActionState<LoginState, FormData>(
    verifyLoginCode,
    { step: "email" },
  );

  if (emailState.step === "code") {
    return (
      <form action={checkCode} className="space-y-4">
        <input type="hidden" name="email" value={emailState.email} />
        <p className="text-sm">
          Te hemos enviado un enlace y un código a <strong>{emailState.email}</strong>. Abre el
          enlace en este navegador o escribe el código aquí.
        </p>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Código de 6 dígitos"
          className={input}
          required
        />
        {codeState.error && <p className="text-sm text-red-600">{codeState.error}</p>}
        <button className={button} disabled={checking}>
          {checking ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    );
  }

  return (
    <form action={sendCode} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="email">
        Email invitado
      </label>
      <input id="email" name="email" type="email" autoComplete="email" className={input} required />
      {emailState.error && <p className="text-sm text-red-600">{emailState.error}</p>}
      <button className={button} disabled={sending}>
        {sending ? "Enviando…" : "Recibir enlace de acceso"}
      </button>
    </form>
  );
}

/**
 * Guardas de arranque del entorno privado.
 *
 * Este módulo NO tiene dependencias para poder importarse desde
 * `next.config.ts` (se evalúa en `next dev`, `next build` y `next start`)
 * y desde `instrumentation.ts`. Si algo no cuadra, lanza un error y el
 * servidor no arranca.
 *
 * Reglas:
 *  - PUBLIC_LAUNCH debe existir y valer exactamente "false". Cualquier otro
 *    valor bloquea el arranque: abrir al público exige completar el checklist
 *    del README y retirar esta guarda a propósito en el código.
 *  - ALLOWED_EMAILS: entre 1 y 3 emails válidos. Nunca más de 3.
 *  - ADMIN_EMAIL debe estar dentro de ALLOWED_EMAILS.
 *  - Stripe: solo claves de test (sk_test_ / pk_test_ / rk_test_ / whsec_).
 *    Si aparece cualquier clave live, se bloquea el arranque.
 */

export const MAX_ALLOWED_USERS = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UnsafeEnvironmentError extends Error {
  constructor(problems: string[]) {
    super(
      [
        "",
        "================================================================",
        " ARRANQUE BLOQUEADO: el entorno no es un entorno privado de pruebas",
        "================================================================",
        ...problems.map((p) => ` - ${p}`),
        "",
        " Revisa .env.local (ver .env.example) y la sección",
        ' "Antes de abrir al público" del README.',
        "================================================================",
      ].join("\n"),
    );
    this.name = "UnsafeEnvironmentError";
  }
}

export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

type Env = Record<string, string | undefined>;

export function collectEnvProblems(env: Env): string[] {
  const problems: string[] = [];

  // --- PUBLIC_LAUNCH -------------------------------------------------------
  if (env.PUBLIC_LAUNCH !== "false") {
    problems.push(
      `PUBLIC_LAUNCH debe ser exactamente "false" (valor actual: ${JSON.stringify(
        env.PUBLIC_LAUNCH ?? null,
      )}). El lanzamiento público no está implementado en este MVP.`,
    );
  }

  // --- Allowlist -----------------------------------------------------------
  const allowed = parseEmailList(env.ALLOWED_EMAILS);
  if (allowed.length === 0) {
    problems.push("ALLOWED_EMAILS está vacío: define hasta 3 emails separados por comas.");
  }
  if (allowed.length > MAX_ALLOWED_USERS) {
    problems.push(
      `ALLOWED_EMAILS contiene ${allowed.length} emails; el máximo es ${MAX_ALLOWED_USERS}.`,
    );
  }
  if (new Set(allowed).size !== allowed.length) {
    problems.push("ALLOWED_EMAILS contiene emails duplicados.");
  }
  for (const e of allowed) {
    if (!EMAIL_RE.test(e)) problems.push(`Email no válido en ALLOWED_EMAILS: ${e}`);
  }

  const admin = (env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!admin) {
    problems.push("ADMIN_EMAIL no está definido.");
  } else if (!allowed.includes(admin)) {
    problems.push("ADMIN_EMAIL debe ser uno de los emails de ALLOWED_EMAILS.");
  }

  // --- Stripe: solo modo test ----------------------------------------------
  // Cualquier variable cuyo valor parezca una clave live bloquea el arranque,
  // se llame como se llame.
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string" && /^(sk|pk|rk)_live_/.test(value.trim())) {
      problems.push(`${name} contiene una clave LIVE de Stripe. Solo se permiten claves de test.`);
    }
  }
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (secret && !secret.startsWith("sk_test_") && !secret.startsWith("rk_test_")) {
    problems.push("STRIPE_SECRET_KEY debe empezar por sk_test_ (o rk_test_).");
  }
  const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (publishable && !publishable.startsWith("pk_test_")) {
    problems.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY debe empezar por pk_test_.");
  }

  return problems;
}

/** Lanza si el entorno no es seguro. Llamar al arrancar. */
export function assertSafeEnvironment(env: Env = process.env): void {
  const problems = collectEnvProblems(env);
  if (problems.length > 0) throw new UnsafeEnvironmentError(problems);
}

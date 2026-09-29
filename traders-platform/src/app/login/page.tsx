import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  not_allowed: "Acceso restringido: este entorno privado solo admite emails invitados.",
  link: "El enlace no es válido o ha caducado. Pide uno nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialError = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">Acceso privado</h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Solo pueden entrar las personas invitadas a este entorno de pruebas. No hay registro
        público.
      </p>
      <LoginForm initialError={initialError} />
    </main>
  );
}

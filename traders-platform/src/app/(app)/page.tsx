import { requireOnboardedUser } from "@/lib/auth";
import { NOT_ADVICE } from "@/legal/documents";

export default async function HomePage() {
  const { profile } = await requireOnboardedUser();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hola, {profile.display_name}</h1>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        {NOT_ADVICE}
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Fase 1: acceso privado, registro con aceptaciones legales y auditoría. El resto de
        funciones (perfiles de trader, publicaciones, suscripciones) llegan en las siguientes fases.
      </p>
    </div>
  );
}

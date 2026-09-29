import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LEGAL_DOCUMENTS, REGISTRATION_DOCS } from "@/legal/documents";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile, legalUpToDate } = session;
  if (profile.onboarded_at && profile.role && legalUpToDate) redirect("/");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">
        {profile.onboarded_at ? "Actualización de condiciones" : "Completa tu registro"}
      </h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Para usar la plataforma debes aceptar expresamente cada documento. Guardamos la fecha y la
        versión que aceptas.
      </p>
      <OnboardingForm
        isAdmin={profile.role === "admin"}
        fixedRole={profile.role}
        defaultName={profile.display_name === "Usuario" ? "" : profile.display_name}
        docs={REGISTRATION_DOCS.map((k) => LEGAL_DOCUMENTS[k])}
      />
    </main>
  );
}

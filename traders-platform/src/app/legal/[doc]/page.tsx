import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LEGAL_DOCUMENTS, type LegalKey } from "@/legal/documents";
import { LegalDocBody } from "@/components/legal-doc";

// Fuera del layout con onboarding obligatorio para poder leerlos antes de
// aceptarlos, pero siempre tras login (el proxy también lo exige).
export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  if (!(await getSession())) redirect("/login");
  const { doc: key } = await params;
  const doc = LEGAL_DOCUMENTS[key as LegalKey];
  if (!doc) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/" className="text-sm underline">
        ← Volver
      </Link>
      <h1 className="my-4 text-2xl font-bold">{doc.title}</h1>
      <LegalDocBody doc={doc} />
    </main>
  );
}

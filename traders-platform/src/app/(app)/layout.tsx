import Link from "next/link";
import { requireOnboardedUser, type Role } from "@/lib/auth";
import { NOT_ADVICE } from "@/legal/documents";
import { signOut } from "@/app/login/actions";

const NAV: Record<Role, { href: string; label: string }[]> = {
  suscriptor: [
    { href: "/", label: "Inicio" },
    { href: "/cuenta", label: "Mi cuenta" },
  ],
  trader: [
    { href: "/", label: "Inicio" },
    { href: "/cuenta", label: "Mi cuenta" },
  ],
  admin: [
    { href: "/", label: "Inicio" },
    { href: "/admin/auditoria", label: "Auditoría" },
    { href: "/cuenta", label: "Mi cuenta" },
  ],
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireOnboardedUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <span className="truncate text-sm">
            <strong>{profile.display_name}</strong>{" "}
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">
              {profile.role}
            </span>
          </span>
          <form action={signOut}>
            <button className="text-sm underline">Salir</button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {NAV[profile.role].map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-800">
        {NOT_ADVICE}{" "}
        <Link href="/legal/terminos" className="underline">
          Términos
        </Link>{" "}
        ·{" "}
        <Link href="/legal/privacidad" className="underline">
          Privacidad
        </Link>{" "}
        ·{" "}
        <Link href="/legal/aviso_legal" className="underline">
          Aviso legal
        </Link>
      </footer>
    </div>
  );
}

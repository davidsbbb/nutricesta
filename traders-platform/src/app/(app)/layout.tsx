import Link from "next/link";
import { requireOnboardedUser, type Role } from "@/lib/auth";
import { NOT_ADVICE } from "@/legal/documents";
import { signOut } from "@/app/login/actions";
import { FocoLogo } from "@/components/brand";

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
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link href="/" aria-label="FOCO, inicio">
            <FocoLogo className="text-xl" />
          </Link>
          <span className="truncate text-sm">
            <strong>{profile.display_name}</strong>{" "}
            <span className="rounded bg-navy-light px-1.5 py-0.5 text-xs">
              {profile.role}
            </span>
            <form action={signOut} className="ml-3 inline">
              <button className="underline">Salir</button>
            </form>
          </span>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {NAV[profile.role].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-white/80 hover:text-brand"
            >
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

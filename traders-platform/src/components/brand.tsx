/**
 * Identidad FOCO. Símbolo redibujado en vectorial a partir del logo
 * facilitado: "F" blanca de dos trazos inclinados + hoja verde.
 */
export const BRAND = {
  name: "FOCO",
  navy: "#0b2447",
  green: "#22a34a",
};

export function FocoSymbol({
  className,
  mono = false,
}: {
  className?: string;
  /** true: todo en currentColor (p.ej. sobre fondo claro usa texto navy). */
  mono?: boolean;
}) {
  return (
    <svg viewBox="0 0 96 150" className={className} aria-hidden="true">
      <g fill="currentColor">
        <path d="M0 40 L86 3 Q95 -1 95 9 L95 26 Q95 33 88 36 L0 83 Z" />
        <path d="M0 93 L74 63 Q82 60 80 68 L76 82 Q74 88 67 91 L34 104 Q22 109 22 122 L22 144 L0 150 Z" />
      </g>
      <path
        d="M37 124 L72 104 Q78 101 78 108 L78 136 Q78 144 70 145 L37 150 Z"
        fill={mono ? "currentColor" : BRAND.green}
      />
    </svg>
  );
}

export function FocoLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <FocoSymbol className="h-[1.3em] w-auto" />
      <span>{BRAND.name}</span>
    </span>
  );
}

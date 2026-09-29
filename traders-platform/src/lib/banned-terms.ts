/**
 * Réplica en cliente del filtro de la BD (public.find_banned_terms) para
 * avisar mientras se escribe. La comprobación que cuenta es la de la BD.
 */
export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function findBannedTerms(text: string, terms: string[], patterns: string[]): string[] {
  const norm = normalizeText(text);
  const found: string[] = [];
  for (const t of terms) if (norm.includes(normalizeText(t))) found.push(t);
  for (const p of patterns) {
    try {
      // Sintaxis POSIX de Postgres: traducimos las clases más comunes.
      const m = norm.match(new RegExp(p.replace(/\\m/g, "\\b"), "i"));
      if (m) found.push(m[0]);
    } catch {
      /* patrón no compatible con JS: solo lo aplica la BD */
    }
  }
  return found;
}

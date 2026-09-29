# Plataforma de traders — MVP privado de pruebas

> **Entorno privado de pruebas. No es un servicio de inversión.**
> Máximo 3 usuarios invitados, Stripe solo en modo test, sin datos reales.

Plataforma web (mobile-first) donde traders publican contenido de inversión
**general** (carteras y tesis iguales para todos sus suscriptores) y los
clientes se suscriben mensualmente. La plataforma cobra una comisión.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Auth,
Postgres, RLS, Storage) · Stripe Connect (test).

---

## ⚠️ Antes de abrir al público

La app **se niega a arrancar** si `PUBLIC_LAUNCH` no vale exactamente
`false`. No existe un "modo público": para abrirla hay que completar esta
lista **y** modificar el código a propósito (`src/lib/env-guard.ts`,
allowlist, tope de 3 usuarios en la BD, banner, bloqueo de claves live).

- [ ] **Abogado especialista en MiFID II / CNMV**: confirmar que el contenido
      general no es asesoramiento en materia de inversión
      (art. 125 LMV / MiFID II) ni exige autorización de ESI/EAF; revisar
      las exenciones para "recomendaciones generales" y el Reglamento de
      Abuso de Mercado (MAR, art. 20: recomendaciones de inversión y
      conflictos de interés).
- [ ] Revisión y redacción final de **todos los textos legales** (hoy son
      plantillas marcadas "PENDIENTE DE REVISIÓN POR ABOGADO"): términos,
      aviso legal (LSSI-CE), privacidad, desistimiento (TRLGDCU),
      no-asesoramiento, publicidad financiera (Circular CNMV 2/2020).
- [ ] **RGPD**: registro de actividades de tratamiento, EIPD si procede,
      contratos de encargado con Supabase y Stripe, transferencias
      internacionales, plazos de conservación, DPD si procede.
- [ ] **DAC7**: alta como operador de plataforma, recogida y validación de
      NIF/país de los vendedores y declaración anual (modelo 238).
- [ ] **Sociedad** constituida, cuenta de Stripe Connect a nombre de la
      sociedad, fiscalidad (IVA en servicios digitales, retenciones).
- [ ] **Seguro** de responsabilidad civil profesional / ciberriesgos.
- [ ] Verificación de track record con fuente fiable (hoy es manual).
- [ ] Moderación: procedimiento para reportes y retirada de contenido
      (y obligaciones del Reglamento de Servicios Digitales, DSA).
- [ ] Seguridad: pentest, copias de seguridad, rotación de claves, SMTP
      propio para el login.
- [ ] Solo entonces: cambiar `PUBLIC_LAUNCH` y retirar las guardas en código.

---

## Regla nº1: privado, solo 3 usuarios — cómo se aplica

| Medida | Dónde |
| --- | --- |
| Login obligatorio en todas las rutas salvo `/login` (y los endpoints técnicos `/auth/callback`, webhook de Stripe) | `src/proxy.ts` |
| Allowlist `ALLOWED_EMAILS` (máx. 3) comprobada al pedir acceso **y en cada petición** (quitar un email revoca el acceso) | `src/proxy.ts`, `src/app/login/actions.ts` |
| Registro público de Supabase desactivado; solo el servidor crea usuarios de la allowlist | `supabase/config.toml` (`enable_signup = false`) |
| Tope duro de 3 filas en `auth.users` (trigger) | migración `..._core.sql` |
| `noindex,nofollow` (meta + cabecera `X-Robots-Tag`), `robots.txt` con `Disallow: /`, sin sitemap, sin analytics, sin redes sociales, sin fuentes de terceros | `src/app/layout.tsx`, `next.config.ts`, `public/robots.txt` |
| Banner fijo en todas las páginas | `src/app/layout.tsx` |
| Arranque bloqueado con claves live de Stripe (en cualquier variable), `PUBLIC_LAUNCH != false` o allowlist inválida | `src/lib/env-guard.ts` (se ejecuta en `next.config.ts` e `instrumentation.ts`) |

---

## Ejecutar en local

Requisitos: Node 20.9+, Docker (para Supabase local).

```bash
cd traders-platform
npm install

# 1. Supabase local (Postgres, Auth, Storage, Mailpit para los emails)
npx supabase start          # la primera vez descarga imágenes Docker
npx supabase status         # copia API URL, anon key y service_role key

# 2. Variables de entorno
cp .env.example .env.local  # rellena claves de Supabase y tus 3 emails

# 3. Aplicar migraciones (supabase start ya las aplica; tras cambios:)
npx supabase db reset

# 4. Arrancar
npm run dev                 # http://127.0.0.1:3000
```

**Login**: introduce uno de los emails de `ALLOWED_EMAILS`. En local el
email no sale a Internet: ábrelo en Mailpit (http://127.0.0.1:54324) y usa
el enlace o el código de 6 dígitos. El email de `ADMIN_EMAIL` recibe el rol
admin; los otros eligen trader o suscriptor en el registro, donde deben
aceptar uno a uno los documentos legales (se guarda fecha, versión y hash).

### Pruebas de la base de datos

Aplican las migraciones sobre un Postgres vacío (con un stub del esquema
`auth` de Supabase) y comprueban RLS, inmutabilidad del log, tope de
usuarios, etc.:

```bash
PGURL=postgres://postgres@127.0.0.1:5432 npm run test:db
# con Supabase local: PGURL=postgresql://postgres:postgres@127.0.0.1:54322 (usa una BD aparte)
```

### Otros comandos

```bash
npm run lint
npm run typecheck
npm run build
```

---

## Arquitectura (fase 1)

- **Roles**: `admin`, `trader`, `suscriptor` (`public.profiles.role`). El
  usuario no puede cambiar su rol (privilegios por columna + RPC
  `complete_onboarding`); solo el admin con `admin_set_role`.
- **Aceptaciones legales**: `legal_documents` (clave + versión vigente) y
  `legal_acceptances` (inmutable). Si se publica una versión nueva, el
  usuario vuelve al onboarding para re-aceptar.
- **Log de auditoría** `public.audit_log`: solo inserción mediante
  `private.audit()` / triggers; `UPDATE`, `DELETE` y `TRUNCATE` bloqueados
  por trigger incluso para `service_role`; cada fila encadena el SHA-256 de
  la anterior (`verify_audit_chain()`, visible en `/admin/auditoria`). Se
  registra el id interno del actor (seudónimo), nunca emails.
- **Ajustes** `platform_settings` (comisión en puntos básicos, retraso de
  publicación, palabras prohibidas y modo bloquear/revisar), editables solo
  por el admin y auditados.

Nota técnica: un superusuario de Postgres podría desactivar triggers; la
cadena de hashes permite detectar la manipulación. Para inmutabilidad
fuerte en producción, exportar periódicamente el último hash a un sistema
externo (WORM).

## Fases

1. ✅ Base: acceso privado, guardas, roles, onboarding legal, auditoría.
2. Perfiles de trader, verificación de track record, publicaciones con
   salvaguardas (declaraciones, retraso, operación contraria, palabras
   prohibidas).
3. Suscripciones con Stripe Connect (test), desistimiento, cancelación,
   paneles de comisiones e ingresos.
4. Comentarios públicos + reportes, ranking neutro, RGPD (exportar/borrar),
   campos fiscales DAC7.

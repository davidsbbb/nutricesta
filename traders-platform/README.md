# FOCO — plataforma de traders (MVP privado de pruebas)

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
| Tope duro de 3 filas en `auth.users` y allowlist propia en la BD (`private.allowed_emails`): la BD rechaza cualquier otro email aunque se llame a la API directamente | migraciones `..._core.sql`, `..._allowlist.sql` |
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
el enlace o el código de 6 dígitos. Los emails de `ADMIN_EMAILS` reciben el rol
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

### Prueba de extremo a extremo (simula a los 3 usuarios en un móvil)

Con Supabase local arrancado, `.env.local` con
`ALLOWED_EMAILS=admin@foco.test,trader@foco.test,sub@foco.test` y
`ADMIN_EMAILS=admin@foco.test`, y la app en marcha (`npm run build && npm start`):

```bash
npx supabase db reset   # base de datos vacía
npm run test:e2e        # capturas en e2e-screenshots/
```

Recorre: rechazo de desconocidos, login con el código del email, registro
con aceptaciones, perfil y datos fiscales del trader, subida de extracto,
bloqueo por operación contraria, publicación programada con retraso,
publicación retenida por palabras prohibidas, suscriptor sin acceso al
contenido, verificación y revisión del admin, auditoría íntegra, enlace del
email abierto en otro navegador y que ninguna pantalla desborde a 390 px.

### Otros comandos

```bash
npm run lint
npm run typecheck
npm run build
```

---

## Probarla los 3 desde el móvil / ordenador (despliegue privado)

Para que tú y tus dos amigos la uséis desde cualquier sitio hay que
publicarla en Internet, pero **sigue siendo privada**: sin login no se ve
nada, solo entran los 3 emails de `ALLOWED_EMAILS`, la base de datos rechaza
cualquier otro email, no se indexa en buscadores y Stripe va en modo test.
Todo con planes gratuitos.

### 1. Supabase (base de datos + login) — https://supabase.com

1. Crea un proyecto. Región **UE** (p. ej. Frankfurt o Irlanda, por RGPD).
   Guarda la contraseña de la base de datos.
2. Aplica las migraciones. **Sin terminal**: abre *SQL Editor → New query*,
   pega el contenido de `supabase/deploy/todo-en-uno.sql` y pulsa *Run*
   (una sola vez, en el proyecto vacío). **Con terminal**, alternativa:
   ```bash
   cd traders-platform
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push
   ```
3. **Authentication → Sign In / Providers**:
   - Desactiva **"Allow new users to sign up"** (registro cerrado).
   - Deja activado el proveedor Email (el servidor crea los usuarios ya
     confirmados, así que "Confirm email" da igual).
4. **Authentication → URL Configuration**:
   - Site URL: `https://<tu-app>.vercel.app`
   - Redirect URLs: `https://<tu-app>.vercel.app/auth/callback`
5. **Authentication → Emails → Magic Link**: asunto "Tu acceso a FOCO" y
   pega el contenido de `supabase/templates/magic_link.html` (incluye el
   código de 6 dígitos y un enlace que funciona aunque lo abras desde la app
   de correo del móvil).
6. **Authentication → Emails → SMTP Settings**: el correo integrado de
   Supabase solo envía a los miembros del equipo del proyecto y ~2 emails por
   hora, así que configura un SMTP propio. Opciones gratis:
   - **Resend** (resend.com): host `smtp.resend.com`, puerto 465, usuario
     `resend`, contraseña = tu API key. Requiere verificar un dominio.
   - **Gmail**: host `smtp.gmail.com`, puerto 465, tu Gmail y una
     "contraseña de aplicación" (Cuenta de Google → Seguridad → Verificación
     en 2 pasos → Contraseñas de aplicación).
7. **Project Settings → API**: copia la URL, la `anon` key y la
   `service_role` key (esta última es secreta: solo va en Vercel).

### 2. Vercel (la web) — https://vercel.com

1. "Add New → Project" e importa este repositorio de GitHub.
2. **Root Directory: `traders-platform`** (importante: la raíz del repo es
   otra app, NutriCesta).
3. Variables de entorno (Production y Preview), las mismas de
   `.env.example`:
   `PUBLIC_LAUNCH=false`, `ALLOWED_EMAILS=tu@email,amigo1@email,amigo2@email`,
   `ADMIN_EMAILS=tu@email` (puedes poner los 3 para que todos podáis cambiar de modo), `NEXT_PUBLIC_SITE_URL=https://<tu-app>.vercel.app`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` y (desde la fase 3) las claves **de test** de
   Stripe. Si pones algo mal (una clave live, 4 emails, `PUBLIC_LAUNCH`
   distinto de `false`) el build falla a propósito.
4. Deploy. Comparte la URL **solo** con tus dos amigos.
5. Opcional: en Settings → Deployment Protection deja activada la protección
   de las "Preview deployments" (viene por defecto).

### 3. Primer acceso

Cada uno abre la URL en su móvil u ordenador, pone su email, y recibe un
email con un código de 6 dígitos y un enlace. Primero debe entrar el admin
(de `ADMIN_EMAILS`). En el registro cada uno elige trader o suscriptor y acepta
los textos legales. Para quitarle el acceso a alguien: bórralo de
`ALLOWED_EMAILS` en Vercel y vuelve a desplegar (el acceso se corta en la
siguiente petición).

### Qué impide que otra persona la vea

- Sin sesión, todas las páginas redirigen a `/login`; la API de la base de
  datos no devuelve nada al rol anónimo.
- Emails fuera de `ALLOWED_EMAILS`: rechazados por la app, por el trigger de
  la base de datos (`private.allowed_emails`) y por el tope de 3 usuarios.
- `noindex,nofollow` + `X-Robots-Tag` + `robots.txt Disallow: /`: los
  buscadores no la indexan aunque alguien publique el enlace.

## Salvaguardas de las publicaciones (fase 2)

Todas se aplican **en la base de datos** (funciones `create_post`,
`edit_post`…); el navegador solo avisa antes. Nadie puede escribir en
`posts` directamente.

| Regla | Cómo |
| --- | --- |
| Declaración de posiciones propias por activo mencionado | `post_assets`: visión, posición, operación de los últimos 30 días; mínimo 1 activo |
| Declaración de conflictos de interés y aviso de riesgos | Campos obligatorios; el aviso se muestra en cada publicación |
| Retraso mínimo (24 h por defecto, configurable) | `publish_at = envío + publish_delay_hours`; antes de esa hora no la ve nadie salvo autor y admin |
| Bloqueo por operación en sentido contrario | Visión alcista con posición corta o venta reciente (o al revés), o intención declarada de operar en contra → error |
| Palabras prohibidas y promesas de rentabilidad | Lista + expresiones regulares, sin distinguir mayúsculas ni tildes; modo "revisión" (queda retenida) o "bloqueo" |
| Ediciones | Se guarda la versión anterior (inmutable), se vuelve a filtrar, queda auditada; activos/posiciones no editables |
| Visibilidad | Autor y admin; los suscriptores con suscripción activa a partir de la fase 3 |

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
2. ✅ Perfiles de trader (métricas + aviso de rentabilidades pasadas), datos
   fiscales DAC7, verificación manual de extractos, publicaciones con
   salvaguardas (declaración de posiciones y conflictos, aviso de riesgos,
   retraso mínimo, bloqueo por operación contraria, filtro de palabras
   prohibidas y promesas de rentabilidad, revisiones inmutables), panel de
   revisión y ajustes del admin, listado de traders con orden neutro.
3. Suscripciones con Stripe Connect (test), desistimiento, cancelación,
   paneles de comisiones e ingresos.
4. Comentarios públicos + reportes, RGPD (exportar/borrar).

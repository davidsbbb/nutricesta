// Prueba de extremo a extremo contra la app + Supabase local.
// Requisitos: `npx supabase start`, `.env.local` con los 3 emails de abajo y
// la app en marcha (npm run build && npm start).
// Uso: node scripts/e2e.mjs   (Playwright instalado global o en el proyecto)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const SHOTS = process.env.SHOTS_DIR ?? "e2e-screenshots";
const USERS = {
  admin: "admin@foco.test",
  trader: "trader@foco.test",
  sub: "sub@foco.test",
};
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? "✔" : "✘"} ${label}`);
  if (!cond) failures++;
}

async function lastEmailFor(email, after) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = await res.json();
    const m = messages?.find((x) => new Date(x.Created) > after);
    if (m) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      return full;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó email a ${email}`);
}

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function newPage() {
  const ctx = await browser.newContext(phone);
  return ctx.newPage();
}

async function shot(page, name) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(width <= 390, `Sin scroll horizontal en móvil: ${name} (${width}px)`);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function login(page, email) {
  await page.goto(`${APP}/login`);
  const since = new Date(Date.now() - 1000);
  await page.fill("#email", email);
  await page.click("text=Recibir enlace de acceso");
  await page.waitForSelector("input[name=code]");
  const mail = await lastEmailFor(email, since);
  const code = mail.Text.match(/\b(\d{6})\b/)?.[1];
  await page.fill("input[name=code]", code);
  await page.click("button:has-text('Entrar')");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return mail;
}

async function onboard(page, name, role) {
  await page.waitForURL(/onboarding/);
  await page.fill("#display_name", name);
  if (role) await page.check(`input[name=role][value=${role}]`);
  for (const box of await page.$$("input[type=checkbox][name^=accept_]")) await box.check();
  await page.click("text=Aceptar y continuar");
  await page.waitForURL(`${APP}/`);
}

// 0. Sin sesión: todo redirige a /login; desconocido rechazado
{
  const page = await newPage();
  await page.goto(`${APP}/traders`);
  check(page.url().endsWith("/login"), "Sin sesión, /traders redirige a /login");
  check((await page.locator("meta[name=robots]").getAttribute("content")).includes("noindex"), "meta robots noindex");
  check(await page.isVisible("text=Entorno privado de pruebas. No es un servicio de inversión."), "Banner visible");
  await page.fill("#email", "desconocido@gmail.com");
  await page.click("text=Recibir enlace de acceso");
  await page.waitForSelector("text=Acceso restringido");
  check(true, "Email no invitado rechazado");
  await shot(page, "01-login-rechazado");
  await page.context().close();
}

// 1. Admin
const admin = await newPage();
await login(admin, USERS.admin);
await shot(admin, "02-onboarding");
await onboard(admin, "Admin FOCO");
check(await admin.isVisible("text=Revisión"), "Admin ve menú de admin");

// 2. Trader: registro, perfil, fiscal, extracto, publicaciones
const trader = await newPage();
await login(trader, USERS.trader);
await onboard(trader, "Trader Uno", "trader");
await trader.goto(`${APP}/trader/perfil`);
await trader.fill("#bio", "Inversor particular desde 2018.");
await trader.fill("#strategy", "Value investing a largo plazo en acciones de calidad.");
await trader.fill("#return_12m_pct", "14,2");
await trader.fill("#max_drawdown_pct", "21");
await trader.fill("#trading_since", "2018-03-01");
await trader.fill("#metrics_as_of", "2026-08-31");
await trader.click("text=Guardar perfil");
await trader.waitForSelector("text=Perfil guardado.");
check(true, "Trader guarda su perfil");
await trader.fill("#tax_id", "12345678z");
await trader.fill("#tax_country", "es");
await trader.click("text=Guardar datos fiscales");
await trader.waitForSelector("text=Datos fiscales guardados.");
check(true, "Trader guarda datos fiscales (DAC7)");
await shot(trader, "03-perfil-trader");

writeFileSync("/tmp/extracto-ficticio.pdf", "%PDF-1.4\n% extracto ficticio de pruebas\n%%EOF\n");
await trader.goto(`${APP}/trader/verificacion`);
await trader.setInputFiles("#file", "/tmp/extracto-ficticio.pdf");
await trader.fill("#period_start", "2025-09-01");
await trader.fill("#period_end", "2026-08-31");
await trader.click("text=Enviar para verificación");
await trader.waitForSelector("text=Extracto enviado");
check(true, "Trader sube extracto");

// Publicación con operación en sentido contrario: bloqueada en la UI
await trader.goto(`${APP}/trader/publicaciones/nueva`);
await trader.fill("[aria-label=Ticker]", "TSLA");
await trader.selectOption("select >> nth=0", "alcista");
await trader.selectOption("select >> nth=1", "corta");
check(await trader.isVisible("text=Publicación bloqueada: has operado"), "Aviso de operación contraria");
check(await trader.isDisabled("text=Enviar publicación"), "Botón deshabilitado con operación contraria");

// Publicación limpia
await trader.goto(`${APP}/trader/publicaciones/nueva`);
await trader.fill("#title", "Tesis: Apple y los servicios");
await trader.fill("#body", "Análisis general del peso creciente de los servicios en el negocio de Apple y su valoración actual.");
await trader.fill("[aria-label=Ticker]", "aapl");
await trader.selectOption("select >> nth=1", "larga");
await trader.fill("#conflicts", "Tengo acciones de AAPL en cartera.");
await trader.check("input[name=risk_ack]");
await trader.check("input[name=positions_ack]");
await shot(trader, "04-nueva-publicacion");
await trader.click("text=Enviar publicación");
await trader.waitForURL(/\/publicaciones\/[0-9a-f-]{36}$/);
check(await trader.isVisible("text=Programada"), "Publicación limpia queda programada (retraso 24 h)");
await shot(trader, "05-publicacion-programada");

// Publicación con palabras prohibidas: retenida
await trader.goto(`${APP}/trader/publicaciones/nueva`);
await trader.fill("#title", "Cartera de dividendos garantizada");
await trader.fill("#body", "Rentabilidad del 3 % mensual con estas acciones, sin riesgo alguno.");
check(await trader.isVisible("text=Expresiones no permitidas"), "Aviso en vivo de expresiones prohibidas");
await trader.fill("[aria-label=Ticker]", "SAN.MC");
await trader.fill("#conflicts", "Ninguno");
await trader.check("input[name=risk_ack]");
await trader.check("input[name=positions_ack]");
await trader.click("text=Enviar publicación");
await trader.waitForURL(/\/publicaciones\/[0-9a-f-]{36}$/);
const flaggedUrl = trader.url();
check(await trader.isVisible("text=En revisión del admin"), "Publicación con prohibidas queda en revisión");

// 3. Suscriptor: no ve contenido sin suscripción
const sub = await newPage();
await login(sub, USERS.sub);
await onboard(sub, "Suscriptor Uno", "suscriptor");
await sub.goto(`${APP}/traders`);
check(await sub.isVisible("text=Trader Uno"), "Suscriptor ve el listado de traders");
await shot(sub, "06-traders");
await sub.click("text=Trader Uno");
await sub.waitForURL(/\/traders\/[0-9a-f-]{36}$/);
check(await sub.isVisible("text=solo para sus suscriptores"), "Suscriptor no ve publicaciones sin suscripción");
await shot(sub, "07-perfil-publico");
const r = await sub.goto(flaggedUrl);
check(r.status() === 404, "Suscriptor no accede a una publicación por URL directa");
await sub.goto(`${APP}/admin/auditoria`);
check(sub.url() === `${APP}/`, "Suscriptor no entra en páginas de admin");

// 4. Admin: verifica extracto, revisa publicación, ajustes, auditoría
await admin.goto(`${APP}/admin/verificaciones`);
await admin.click("button:has-text('Verificar')");
await admin.waitForSelector("text=Track record verificado");
check(true, "Admin verifica el track record");
await admin.goto(`${APP}/admin/revision`);
check(await admin.isVisible("text=Detectado:"), "Admin ve la publicación retenida y lo detectado");
await shot(admin, "08-admin-revision");
await admin.click("button:has-text('Rechazar')");
await admin.waitForSelector("text=No hay nada pendiente.");
check(true, "Admin rechaza la publicación retenida");
// Modo de prueba: el admin cambia a trader y vuelve
await admin.goto(`${APP}/cuenta`);
await admin.click("button:has-text('Trader')");
await admin.waitForURL(`${APP}/`);
check(await admin.isVisible("text=Mis publicaciones"), "Modo de prueba: admin pasa a trader");
await admin.goto(`${APP}/admin/revision`);
check(admin.url() === `${APP}/`, "En modo trader no entra en páginas de admin");
await admin.goto(`${APP}/cuenta`);
await shot(admin, "10-modo-prueba");
await admin.click("button:has-text('Admin')");
await admin.waitForURL(`${APP}/`);
check(await admin.isVisible("text=Verificaciones"), "Modo de prueba: vuelve a admin");
await trader.goto(`${APP}/cuenta`);
check(!(await trader.isVisible("text=Modo de prueba")), "Quien no está en ADMIN_EMAILS no puede cambiar de modo");
await admin.goto(`${APP}/admin/auditoria`);
check(await admin.isVisible("text=Cadena de hashes íntegra."), "Auditoría: cadena íntegra");
await shot(admin, "09-auditoria");

await sub.goto(`${APP}/traders`);
check(await sub.isVisible("text=Track record verificado"), "Perfil verificado visible para el suscriptor");

// 5. El enlace del email funciona en otro navegador (móvil / app de correo)
{
  const page = await newPage();
  await page.goto(`${APP}/login`);
  const since = new Date(Date.now() - 1000);
  await page.fill("#email", USERS.sub);
  await page.click("text=Recibir enlace de acceso");
  await page.waitForSelector("input[name=code]");
  const mail = await lastEmailFor(USERS.sub, since);
  await page.context().close();
  const link = mail.HTML.match(/href="([^"]*auth\/callback[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  const other = await newPage(); // contexto nuevo = otro navegador, sin cookies
  await other.goto(link);
  check(other.url() === `${APP}/`, "Enlace mágico funciona en otro navegador");
}

await browser.close();
console.log(failures ? `\n${failures} comprobaciones fallidas` : "\nE2E: todo OK");
process.exit(failures ? 1 : 0);

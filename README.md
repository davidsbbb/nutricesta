# NutriCesta

Planificador de compra semanal y recetas, 100% gratis y sin necesidad de
ninguna API key: el presupuesto, el menú y la lista de la compra se generan
en el propio navegador a partir de una base de datos local de ~450
productos y un motor de recetas con plantillas combinables.

## 1. Requisitos
- Node.js instalado (v18 o superior).

## 2. Cómo arrancarlo
Abre esta carpeta con Claude Code (o una terminal normal) y ejecuta:

```
npm install
npm run dev
```

Se abrirá en tu navegador algo como `http://localhost:5173`.

## 3. Qué esperar
- Todo se calcula al instante en el navegador: no hay llamadas de red, ni
  coste, ni API key que configurar.
- Los precios de `src/data/products.js` son de referencia (aproximados, no
  en tiempo real) — sirven para calcular presupuestos y comparar
  supermercados, no como precio exacto del día.
- Todo se guarda en el almacenamiento local de tu navegador (`localStorage`),
  no hay servidor ni base de datos compartida.

## 4. Siguiente paso: convertirla en HTML para tus amigos
Cuando la hayas probado y ajustado a tu gusto, la compilamos con:

```
npm run build
```

Esto genera una carpeta `dist/` con HTML, CSS y JS ya empaquetados, que se
puede subir gratis a sitios como GitHub Pages, Netlify o Vercel. Como no
necesita ninguna key, tus amigos pueden usarla directamente sin configurar
nada.

## 5. Despliegue en GitHub Pages (para verla desde el móvil)
Este repositorio ya incluye un workflow de GitHub Actions
(`.github/workflows/deploy.yml`) que compila la app y la publica en GitHub
Pages automáticamente cada vez que hay un push a `main`.

Pasos para activarlo (solo hace falta hacerlo una vez):
1. En GitHub, entra en **Settings → Pages** del repositorio.
2. En "Build and deployment" → "Source", elige **GitHub Actions**.
3. Haz merge de esta rama a `main` (o lanza el workflow manualmente desde la
   pestaña **Actions → Deploy to GitHub Pages → Run workflow**).
4. Cuando termine, la app quedará publicada en:
   `https://davidsbbb.github.io/nutricesta/`

Abre esa URL desde el navegador del móvil — no hace falta ningún ajuste
adicional.

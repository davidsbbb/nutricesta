# NutriCesta — versión para probar con Claude Code

Esta es la versión "de bolsillo" del proyecto para que la ejecutes tú en tu ordenador
con Claude Code y la pruebes antes de convertirla en la página web final para tus amigos.

## 1. Requisitos
- Node.js instalado (v18 o superior).
- Una API key de Anthropic: entra en https://console.anthropic.com/settings/keys,
  crea una cuenta si no tienes (te dan unos créditos gratis de prueba) y genera una key.

## 2. Cómo arrancarlo
Abre esta carpeta con Claude Code (o una terminal normal) y ejecuta:

```
npm install
npm run dev
```

Se abrirá en tu navegador algo como `http://localhost:5173`. La primera vez,
pega tu API key en la sección "API key de Anthropic" dentro de la propia app
(se guarda solo en tu navegador, en tu ordenador — nunca sale de ahí).

## 3. Qué esperar
- Cada vez que pulses "Generar plan semanal" o "Ver receta", se hace una llamada
  real a la API de Claude con búsqueda web — tiene un coste mínimo (céntimos por
  plan) que se descuenta de los créditos de tu cuenta de Anthropic.
- Todo se guarda en el almacenamiento local de tu navegador (`localStorage`), no
  hay servidor ni base de datos compartida.

## 4. Siguiente paso: convertirla en HTML para tus amigos
Cuando la hayas probado y ajustado a tu gusto, la compilamos con:

```
npm run build
```

Esto genera una carpeta `dist/` con HTML, CSS y JS ya empaquetados, que se puede
subir gratis a sitios como GitHub Pages, Netlify o Vercel. Para que sea gratis
también para ti cuando la usen tus amigos, cada uno debe meter su propia API key
en la app (igual que has hecho tú) — así cada uno paga (o gasta sus créditos
gratis) por su propio uso, no tú por el de todos.

## 5. Seguridad
No subas nunca tu API key a un repositorio público ni la compartas por chat.
El campo de la app la guarda solo en el navegador de quien la usa.

## 6. Despliegue en GitHub Pages (para verla desde el móvil)
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

Abre esa URL desde el navegador del móvil y añade tu API key de Anthropic en
la sección "API key de Anthropic" (se guarda solo en el almacenamiento local
de ese navegador, nunca se sube a GitHub).

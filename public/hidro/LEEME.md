# Plan Hidráulico · documento de traspaso

Herramienta de **ayuda a la decisión** para planificar el turbinado del día
siguiente. No se conecta al SCADA ni al representante de mercado (W2M): solo
lee los precios públicos de OMIE.

## Qué es técnicamente
- Una web **estática**: HTML, CSS y JavaScript sin dependencias, sin servidor,
  sin base de datos y sin claves ni contraseñas.
- Se puede alojar en **cualquier servidor web** de la empresa (IIS, Apache,
  Nginx, SharePoint con archivos estáticos, GitHub Pages de la organización…).
- Funciona en cualquier navegador moderno, también en el móvil.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html`, `css/`, `js/` | La aplicación |
| `js/hydro.js` | Cálculo: potencia = 9,81 · caudal · salto · rendimiento; plan óptimo por programación dinámica sobre el volumen del embalse |
| `js/data.js` | Lectura de precios OMIE y de la configuración común |
| `centrales.json` | **Datos de las centrales comunes a todo el equipo** |
| `../omie/` | Precios OMIE descargados (los genera el script, no se editan a mano) |
| `../../scripts/fetch-omie.mjs` | Script que descarga los precios de OMIE |

## Precios OMIE automáticos
OMIE no permite descargar desde el navegador, así que un script los baja y los
deja como archivos junto a la web:

```
node scripts/fetch-omie.mjs 60
```

Descarga los últimos 60 días y el día siguiente (si ya está publicado, hacia
las 13:00 hora peninsular) en `public/omie/`. Hay que ejecutarlo **una vez al
día después de las 13:15**, por ejemplo:
- **GitHub Actions** (ya configurado en `.github/workflows/deploy.yml`).
- **Tarea programada de Windows** o `cron` en el servidor donde esté la web:
  ejecutar el comando anterior y copiar la carpeta `omie/` junto a `hidro/`.

Requisito: Node.js 18 o superior. Si un día falla, la herramienta lo indica y
permite pegar los precios a mano.

## Configuración común de centrales
1. En la herramienta: **Centrales** → introducir los datos reales → **Guardar**.
2. **Descargar centrales.json** y sustituir el archivo `centrales.json` de la web.
3. Todos los usuarios lo cargarán automáticamente al abrir la herramienta.

## Qué se guarda y dónde
- Los planes guardados, notas y precios pegados a mano se guardan **en el
  navegador de cada usuario** (no hay base de datos compartida).
- Cada usuario puede exportar e importar su configuración desde *Centrales →
  Copia de seguridad*.

## Limitaciones conocidas
- Salto neto constante (no varía con la cota del embalse).
- Volumen en hm³ (no hay curva cota‑volumen).
- Solo mercado diario; no incluye intradiario, restricciones ni servicios de
  ajuste.
- El resultado es una propuesta: la decisión final y el programa enviado al
  representante son responsabilidad del operador.

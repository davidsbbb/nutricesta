# Plan Hidráulico · documento de traspaso

Herramienta de **ayuda a la decisión** para planificar el turbinado del día
siguiente. No se conecta al SCADA ni al representante de mercado (W2M): solo
lee los precios públicos de OMIE.

## Cómo se usa (día a día)
1. **Precios OMIE** → arrastrar el Excel "Precio del mercado diario" que se
   descarga de OMIE (por ejemplo `INT_PBC_EV_H_1_30_10_2026_30_10_2026.XLS`).
   La fecha se lee del nombre del archivo.
2. **Diario de cotas** → cada mañana, cota de cada central y horas que funcionó
   cada grupo el día anterior. Con eso se calcula la aportación real (cm/día).
3. **Resumen** → plan de las 7 centrales para el día elegido. Se puede cambiar
   la cota de inicio, la aportación y la cota objetivo de cada una.
4. **Central** → detalle: horas bloqueadas u obligatorias, gráficas y hoja de
   maniobras (a qué hora dar la orden de arranque teniendo en cuenta lo que
   tarda cada grupo).
5. Exportar el **CSV cuarto‑horario** para W2M (por central o por grupo).

## Modelo de cada central (pantalla Centrales)
- Cota mínima de explotación y cota máxima normal (m s.n.m.).
- Grupos: potencia, todo/nada o regulable, **cm/h que baja la cota** a plena
  carga, dependencia ("G2 necesita G1") y tiempo de arranque.
  Los cm/h se pueden calcular con una observación del SCADA (botón
  "Calcular los cm/h").
- Cascada: Zaburdón recibe lo turbinado en Chorro del Duque con 1 h 30 min de
  retraso (cm/h que sube Zaburdón con Chorro a plena carga).
- Riego: horas obligatorias de turbinado entre dos fechas (verano).
- **Los valores incluidos son de EJEMPLO** y hay que sustituirlos por los reales.

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
| `js/hydro.js` | Cálculo: plan óptimo por programación dinámica sobre la cota del embalse, con grupos, dependencias, arranques, cascada y riego |
| `js/data.js` | Lectura del Excel de OMIE, diario y configuración común |
| `js/vendor/xlsx.core.min.js` | Lector de Excel (SheetJS, licencia Apache 2.0) incluido para no depender de internet |
| `centrales.json` | **Datos de las centrales comunes a todo el equipo** |
| `../omie/` | Precios OMIE descargados (los genera el script, no se editan a mano) |
| `../../scripts/fetch-omie.mjs` | Script que descarga los precios de OMIE |

## Precios OMIE automáticos (opcional)
Lo normal es cargar el Excel a mano. Si además se publica la web en un
servidor, se pueden descargar solos:
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
- Precios cargados, diario de cotas, datos de partida y notas se guardan **en el
  navegador de cada usuario** (no hay base de datos compartida).
- Cada usuario puede exportar e importar su configuración desde *Centrales →
  Compartir y copias* (centrales.json o copia completa para pasársela a otro compañero).

## Limitaciones conocidas
- Relación lineal entre horas de turbinado y bajada de cota (cm/h constantes);
  en embalses con forma muy irregular conviene recalibrar los cm/h según la cota.
- La potencia de cada grupo no varía con la cota.
- La cascada se calcula en orden (primero Chorro, luego Zaburdón), no a la vez.
- Solo mercado diario; no incluye intradiario, restricciones ni servicios de
  ajuste.
- El resultado es una propuesta: la decisión final y el programa enviado al
  representante son responsabilidad del operador.

# Acumula · BESS Intelligence

Panel web para baterías BESS (stand-alone e híbridas con FV). Sin dependencias
ni compilación: HTML + CSS + JavaScript (módulos ES) y gráficos SVG propios.

## Vistas
- **Ejecutivo**: ingresos, €/MWh instalado, RTE (bruta y corregida por ΔSOC),
  ciclos equivalentes, SOH, SOC/energía diarios, eficiencias, precio OMIE,
  tabla diaria, exportación CSV e informe PDF (imprimir).
- **Mercado BESS**: KPIs de desvíos, cascada de spread (€/MWh instalado·día),
  precios capturados, perfil horario y comparador de estrategias
  (OMIE / mixta / aFRR) sobre el mismo periodo.
- **Tiempo real**: SOC, flujo de potencia del día con consigna, control
  automático / manual / standby, interruptor, paro de emergencia, PPC (P, Q, V,
  FP), diagrama P‑Q, alarmas (incendio, intrusión, SOC mínimo, temperatura) y
  simulación acelerada 60× / 600×.
- **Alarmas**: registro con reconocimiento y exportación.
- **Activos y ajustes**: cartera de activos, parámetros técnicos y de mercado,
  importación de precios OMIE reales (CSV), fuente de datos REST, copia de
  seguridad.

## Motor
Precios cuarto-horarios del mercado diario, banda aFRR y activaciones,
despacho óptimo por programación dinámica (límite de ciclos, coste de
degradación, ventana de SOC, eficiencia, carga solo desde FV en híbridas),
desvíos y sobrecostes, indisponibilidades y degradación (SOH).
Los datos son simulados de forma reproducible salvo que importes precios
reales o conectes una API.

## Probar en local
```
cd public/bess && python3 -m http.server 8000
```
y abre http://localhost:8000. Con `npm run build` se publica junto al resto
del sitio en `/nutricesta/bess/`.

import { PRODUCTS, SUPERMARKET_PRICE_FACTOR, priceAt, productsByCategory } from "../data/products.js";
import { buildRecipe, mealTypesForCount, minutesFor } from "./recipeEngine.js";

const MONTH_WEEKS = 4.345;

function cheapestSupermarket(product, supermarkets) {
  let best = null;
  for (const s of supermarkets) {
    const price = priceAt(product, s);
    if (!best || price < best.price) best = { supermarket: s, price };
  }
  return best;
}

function cheaperAlternative(product, allergies, excludeId) {
  const pool = productsByCategory(product.category, { excludeAllergens: allergies }).filter(
    (p) => p.id !== excludeId && p.price < product.price
  );
  if (!pool.length) return null;
  return pool.reduce((min, p) => (p.price < min.price ? p : min), pool[0]);
}

function buildShoppingLines(usage, prefs) {
  const supermarkets = prefs.supermarkets.length ? prefs.supermarkets : Object.keys(SUPERMARKET_PRICE_FACTOR);
  return Object.entries(usage).map(([productId, packs]) => {
    const product = PRODUCTS.find((p) => p.id === productId);
    const best = cheapestSupermarket(product, supermarkets);
    return { product, packs, supermarket: best.supermarket, unitPrice: best.price, lineTotal: Math.round(best.price * packs * 100) / 100 };
  });
}

function totalOf(lines) {
  return Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
}

function fitBudget(lines, weeklyBudget, allergies) {
  let swapped = false;
  let guard = 0;
  while (totalOf(lines) > weeklyBudget && guard < lines.length * 2) {
    guard++;
    lines.sort((a, b) => b.lineTotal - a.lineTotal);
    let improved = false;
    for (const line of lines) {
      const alt = cheaperAlternative(line.product, allergies, line.product.id);
      if (alt) {
        const best = cheapestSupermarket(alt, [line.supermarket, ...Object.keys(SUPERMARKET_PRICE_FACTOR)]);
        line.product = alt;
        line.supermarket = best.supermarket;
        line.unitPrice = best.price;
        line.lineTotal = Math.round(best.price * line.packs * 100) / 100;
        swapped = true;
        improved = true;
        break;
      }
    }
    if (!improved) break;
  }
  return swapped;
}

function groupBySupermarket(lines) {
  const groups = {};
  for (const line of lines) {
    if (!groups[line.supermarket]) groups[line.supermarket] = [];
    groups[line.supermarket].push(line);
  }
  return Object.entries(groups).map(([supermercado, items]) => ({
    supermercado,
    items: items.map((l) => ({
      producto: l.product.name,
      cantidad: `${l.packs} (${l.product.unit})`,
      precio_estimado: l.lineTotal,
    })),
    total: totalOf(items),
  }));
}

/**
 * Genera el plan semanal completo (menú + lista de la compra) de forma
 * local, sin llamadas de red ni API key. Determinista: las mismas
 * preferencias siempre producen el mismo plan.
 */
export function generatePlan(prefs) {
  const menu = [];
  const recipesByDay = {};
  const usage = {};

  prefs.days.forEach((day) => {
    const mealTypes = mealTypesForCount(Number(day.meals) || 1);
    const availableMinutes = minutesFor(day.time);
    const recipes = mealTypes.map((mealType, i) => {
      const seed = `${day.id}-${i}-${mealType}`;
      const recipe = buildRecipe({ mealType, prefs, availableMinutes, seed });
      if (recipe) {
        recipe.ingredientes.forEach((ing) => {
          usage[ing.productId] = (usage[ing.productId] || 0) + ing.packs;
        });
      }
      return recipe;
    }).filter(Boolean);

    recipesByDay[day.id] = { dia: day.day, comidas: recipes };
    menu.push({ id: day.id, dia: day.day, comidas: recipes.map((r) => r.nombre) });
  });

  const amount = parseFloat(prefs.budgetAmount) || 0;
  const weeklyBudget = Math.round((prefs.budgetPeriod === "Mensual" ? amount / MONTH_WEEKS : amount) * 100) / 100;

  const lines = buildShoppingLines(usage, prefs);
  const swapped = fitBudget(lines, weeklyBudget, prefs.allergies);
  const lista_compra = groupBySupermarket(lines);
  const estimado_gastado = totalOf(lines);
  const ahorro = Math.round((weeklyBudget - estimado_gastado) * 100) / 100;

  const notas = ["Precios de referencia aproximados (no en tiempo real)."];
  if (prefs.budgetPeriod === "Mensual") {
    notas.push(`Equivale a ${weeklyBudget.toFixed(2)} €/semana de tu presupuesto mensual.`);
  }
  if (swapped) {
    notas.push("Se han sustituido algunos productos por alternativas más económicas para no superar tu presupuesto.");
  } else if (estimado_gastado > weeklyBudget) {
    notas.push("Con estos días y presupuesto es ajustado; prueba a subir el presupuesto o reducir días de cocina para más margen.");
  }

  return {
    resumen: {
      presupuesto_disponible: weeklyBudget,
      estimado_gastado,
      ahorro,
      moneda: "EUR",
    },
    menu,
    lista_compra,
    aviso_ahorro: notas.join(" "),
    recipesByDay,
  };
}

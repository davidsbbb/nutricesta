import { CATEGORIES, PRODUCTS, productsByCategory } from "../data/products.js";
import { TEMPLATES, MEAL_TIME_MINUTES } from "../data/recipeTemplates.js";

const MEAT_FISH_TAGS = ["Pollo", "Cerdo", "Ternera", "Pescado"];

function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function pickDeterministic(arr, seedStr) {
  if (!arr.length) return null;
  return arr[hashStr(seedStr) % arr.length];
}

function templateAllowed(t, mealType, prefs, availableMinutes) {
  if (t.mealType !== mealType) return false;
  if (t.timeMin > availableMinutes) return false;
  if (!t.applianceOptions.some((a) => prefs.appliances.includes(a))) return false;
  if (!(t.styles.includes("any") || t.styles.includes(prefs.style))) return false;
  if (MEAT_FISH_TAGS.includes(t.proteinTag) && !prefs.proteins.includes(t.proteinTag)) return false;
  return true;
}

function proteinCandidates(proteinTag, excludeAllergens) {
  if (!proteinTag) return [];
  if (proteinTag === "legumbre") return productsByCategory(CATEGORIES.LEGUMBRE, { excludeAllergens });
  if (proteinTag === "vegetariano") {
    return productsByCategory(CATEGORIES.PROTEINA, { excludeAllergens }).filter(
      (p) => !p.tags.some((tag) => MEAT_FISH_TAGS.includes(tag))
    );
  }
  return productsByCategory(CATEGORIES.PROTEINA, { excludeAllergens, onlyTags: [proteinTag] });
}

function resolveSlots(template, prefs, seedBase) {
  const excludeAllergens = prefs.allergies;
  const proteina = template.proteinTag
    ? pickDeterministic(proteinCandidates(template.proteinTag, excludeAllergens), seedBase + "-proteina")
    : null;
  const verdura = template.verduraSlot
    ? pickDeterministic(productsByCategory(CATEGORIES.VERDURA, { excludeAllergens }), seedBase + "-verdura")
    : null;
  const carbohidrato = template.carbSlot
    ? pickDeterministic(
        productsByCategory(CATEGORIES.CEREAL, { excludeAllergens, onlyTags: template.carbTag ? [template.carbTag] : null }),
        seedBase + "-carbohidrato"
      )
    : null;
  return { proteina, verdura, carbohidrato };
}

function fillText(text, slots) {
  return text
    .replace(/\{proteina\}/g, slots.proteina?.name.toLowerCase() ?? "proteína")
    .replace(/\{verdura\}/g, slots.verdura?.name.toLowerCase() ?? "verdura")
    .replace(/\{carbohidrato\}/g, slots.carbohidrato?.name.toLowerCase() ?? "guarnición");
}

const MACRO_RATIOS = {
  alta_proteina: { protein: 0.4, carbs: 0.3, fat: 0.3 },
  equilibrado: { protein: 0.25, carbs: 0.45, fat: 0.3 },
  bajo_calorico: { protein: 0.3, carbs: 0.4, fat: 0.3 },
};

function macrosFor(calories, macroProfile) {
  const r = MACRO_RATIOS[macroProfile] || MACRO_RATIOS.equilibrado;
  return {
    proteina_g: Math.round((calories * r.protein) / 4),
    carbohidratos_g: Math.round((calories * r.carbs) / 4),
    grasa_g: Math.round((calories * r.fat) / 9),
  };
}

const PORTION_PEOPLE_BASE = 2;

/**
 * Elige una plantilla compatible y la resuelve en una receta concreta con
 * ingredientes reales de la base de datos, respetando alergias,
 * electrodomésticos, estilo, proteínas preferidas y tiempo disponible.
 */
export function buildRecipe({ mealType, prefs, availableMinutes, seed }) {
  const candidates = TEMPLATES.filter((t) => templateAllowed(t, mealType, prefs, availableMinutes));
  const pool = candidates.length ? candidates : TEMPLATES.filter((t) => t.mealType === mealType);
  if (!pool.length) return null;

  const template = pickDeterministic(pool, seed);
  const slots = resolveSlots(template, prefs, seed + "-" + template.id);
  const peopleScale = Math.max(1, Math.ceil(prefs.people / PORTION_PEOPLE_BASE));

  const carbPacks = Math.max(1, Math.ceil(peopleScale / 2));
  const ingredientes = [];
  if (slots.proteina) ingredientes.push({ item: slots.proteina.name, cantidad: `${peopleScale} × ${slots.proteina.unit}`, productId: slots.proteina.id, packs: peopleScale });
  if (slots.verdura) ingredientes.push({ item: slots.verdura.name, cantidad: `${peopleScale} × ${slots.verdura.unit}`, productId: slots.verdura.id, packs: peopleScale });
  if (slots.carbohidrato) ingredientes.push({ item: slots.carbohidrato.name, cantidad: `${carbPacks} × ${slots.carbohidrato.unit}`, productId: slots.carbohidrato.id, packs: carbPacks });

  const appliance = template.applianceOptions.find((a) => prefs.appliances.includes(a)) || template.applianceOptions[0];
  const calorias = template.baseCalories;

  return {
    nombre: fillText(template.name, slots).replace(/^./, (c) => c.toUpperCase()),
    ingredientes,
    pasos: template.steps.map((s) => fillText(s, slots)),
    tiempo_min: template.timeMin,
    electrodomestico: appliance,
    calorias_estimadas: calorias,
    macros: macrosFor(calorias, template.macroProfile),
  };
}

const MEAL_PLANS = {
  1: ["comida"],
  2: ["comida", "cena"],
  3: ["desayuno", "comida", "cena"],
  4: ["desayuno", "comida", "cena", "comida"],
};

export function mealTypesForCount(count) {
  return MEAL_PLANS[Math.min(4, Math.max(1, count))] || MEAL_PLANS[1];
}

export function minutesFor(timeLabel) {
  return MEAL_TIME_MINUTES[timeLabel] ?? 30;
}

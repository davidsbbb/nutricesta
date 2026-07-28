/**
 * Plantillas de recetas con "huecos" que se rellenan con productos de
 * products.js. No son 50 recetas fijas: cada plantilla combinada con
 * los productos compatibles de la base de datos genera cientos de
 * variantes reales (proteína/verdura/carbohidrato distintos), lo que da
 * miles de combinaciones posibles sin necesidad de IA ni red.
 */
import { CATEGORIES } from "./products.js";

// Pistas de proteína: una de PROTEINS (App.jsx) o "vegetariano"
export const TEMPLATES = [
  // ---- Desayunos ----
  { id: "d1", name: "Tostada con {verdura} y huevo", mealType: "desayuno", styles: ["any"], proteinTag: null, applianceOptions: ["Vitrocerámica", "Microondas"], timeMin: 15, verduraSlot: true, carbSlot: true, baseCalories: 320, macroProfile: "equilibrado",
    steps: ["Tuesta el pan.", "Saltea {verdura} unos minutos.", "Cocina un huevo a la plancha y monta la tostada."] },
  { id: "d2", name: "Bol de avena con fruta", mealType: "desayuno", styles: ["any"], proteinTag: null, applianceOptions: ["Microondas", "Vitrocerámica"], timeMin: 10, verduraSlot: false, carbSlot: true, baseCalories: 300, macroProfile: "equilibrado",
    steps: ["Cuece {carbohidrato} con la bebida elegida.", "Añade fruta troceada y remueve."] },
  { id: "d3", name: "Yogur con cereales y frutos secos", mealType: "desayuno", styles: ["any"], proteinTag: null, applianceOptions: ["Microondas"], timeMin: 5, verduraSlot: false, carbSlot: true, baseCalories: 280, macroProfile: "alta_proteina",
    steps: ["Sirve el yogur en un bol.", "Añade {carbohidrato} y frutos secos por encima."] },
  { id: "d4", name: "Tortilla francesa con {verdura}", mealType: "desayuno", styles: ["any"], proteinTag: null, applianceOptions: ["Vitrocerámica"], timeMin: 10, verduraSlot: true, carbSlot: false, baseCalories: 260, macroProfile: "alta_proteina",
    steps: ["Bate los huevos.", "Saltea {verdura} y añade el huevo batido.", "Cuaja a fuego medio por ambos lados."] },
  { id: "d5", name: "Batido de fruta y avena", mealType: "desayuno", styles: ["any"], proteinTag: null, applianceOptions: ["Microondas"], timeMin: 5, verduraSlot: false, carbSlot: true, baseCalories: 250, macroProfile: "equilibrado",
    steps: ["Tritura la fruta con la bebida elegida.", "Añade {carbohidrato} y vuelve a triturar."] },
  { id: "d6", name: "Pan con queso y tomate", mealType: "desayuno", styles: ["any"], proteinTag: null, applianceOptions: ["Vitrocerámica", "Microondas"], timeMin: 10, verduraSlot: true, carbSlot: true, baseCalories: 340, macroProfile: "equilibrado",
    steps: ["Tuesta {carbohidrato}.", "Añade queso y {verdura} troceada por encima."] },

  // ---- Pollo ----
  { id: "p1", name: "{proteina} al horno con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Pollo", applianceOptions: ["Horno"], timeMin: 45, verduraSlot: true, carbSlot: true, baseCalories: 480, macroProfile: "alta_proteina",
    steps: ["Precalienta el horno a 200°C.", "Coloca {proteina} y {verdura} en una bandeja con aceite y sal.", "Hornea 35-40 min hasta dorar.", "Sirve con {carbohidrato}."] },
  { id: "p2", name: "{proteina} a la plancha con {verdura}", mealType: "comida", styles: ["Rápida", "Baja en calorías", "Alta en proteína"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: false, baseCalories: 340, macroProfile: "alta_proteina",
    steps: ["Salpimenta {proteina} y cocina a la plancha 6-8 min por lado.", "Saltea {verdura} en la misma sartén."] },
  { id: "p3", name: "{proteina} en freidora de aire con {carbohidrato}", mealType: "cena", styles: ["Rápida", "Fakeaway"], proteinTag: "Pollo", applianceOptions: ["Freidora de aire"], timeMin: 25, verduraSlot: true, carbSlot: true, baseCalories: 460, macroProfile: "alta_proteina",
    steps: ["Adoba {proteina} con especias.", "Cocina en la freidora de aire a 200°C 15-18 min.", "Acompaña con {carbohidrato} y {verdura}."] },
  { id: "p4", name: "Salteado wok de {proteina} con {verdura}", mealType: "cena", styles: ["Rápida", "Fakeaway"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 430, macroProfile: "equilibrado",
    steps: ["Corta {proteina} en tiras y saltea a fuego fuerte.", "Añade {verdura} troceada y saltea 5 min más.", "Sirve sobre {carbohidrato}."] },
  { id: "p5", name: "{proteina} guisado con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 45, verduraSlot: true, carbSlot: true, baseCalories: 470, macroProfile: "equilibrado",
    steps: ["Dora {proteina} en una cazuela.", "Añade {verdura} y cubre con caldo.", "Cuece a fuego lento 30 min.", "Sirve con {carbohidrato}."] },
  { id: "p6", name: "Brochetas de {proteina} con {verdura}", mealType: "cena", styles: ["Rápida", "Buena digestión"], proteinTag: "Pollo", applianceOptions: ["Horno", "Vitrocerámica"], timeMin: 25, verduraSlot: true, carbSlot: false, baseCalories: 320, macroProfile: "alta_proteina",
    steps: ["Ensarta {proteina} y {verdura} en brochetas.", "Cocina al horno o a la plancha 15-20 min girando."] },
  { id: "p7", name: "{proteina} al curry con {verdura}", mealType: "cena", styles: ["Favoritas en familia", "Fakeaway"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 35, verduraSlot: true, carbSlot: true, baseCalories: 500, macroProfile: "equilibrado",
    steps: ["Dora {proteina} con curry y cebolla.", "Añade {verdura} y leche de coco.", "Cuece 15 min y sirve con {carbohidrato}."] },

  // ---- Cerdo ----
  { id: "c1", name: "{proteina} al horno con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Cerdo", applianceOptions: ["Horno"], timeMin: 50, verduraSlot: true, carbSlot: true, baseCalories: 520, macroProfile: "alta_proteina",
    steps: ["Precalienta el horno a 190°C.", "Coloca {proteina} y {verdura} con aceite y especias.", "Hornea 40 min.", "Sirve con {carbohidrato}."] },
  { id: "c2", name: "{proteina} a la plancha con {verdura}", mealType: "cena", styles: ["Rápida", "Alta en proteína"], proteinTag: "Cerdo", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: false, baseCalories: 380, macroProfile: "alta_proteina",
    steps: ["Cocina {proteina} a la plancha 5-7 min por lado.", "Saltea {verdura} de acompañamiento."] },
  { id: "c3", name: "{proteina} en freidora de aire con {carbohidrato}", mealType: "cena", styles: ["Rápida", "Fakeaway"], proteinTag: "Cerdo", applianceOptions: ["Freidora de aire"], timeMin: 25, verduraSlot: true, carbSlot: true, baseCalories: 470, macroProfile: "alta_proteina",
    steps: ["Adoba {proteina}.", "Cocina en freidora de aire a 190°C 18-20 min.", "Sirve con {carbohidrato} y {verdura}."] },
  { id: "c4", name: "{proteina} guisado con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Cerdo", applianceOptions: ["Vitrocerámica"], timeMin: 60, verduraSlot: true, carbSlot: true, baseCalories: 540, macroProfile: "equilibrado",
    steps: ["Dora {proteina} en la cazuela.", "Añade {verdura} y caldo, cuece a fuego lento 45 min.", "Sirve con {carbohidrato}."] },
  { id: "c5", name: "Salteado de {proteina} con {verdura}", mealType: "cena", styles: ["Rápida"], proteinTag: "Cerdo", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 440, macroProfile: "equilibrado",
    steps: ["Corta {proteina} en tiras finas.", "Saltea con {verdura} a fuego fuerte.", "Sirve sobre {carbohidrato}."] },

  // ---- Ternera ----
  { id: "t1", name: "{proteina} a la plancha con {verdura}", mealType: "cena", styles: ["Rápida", "Alta en proteína"], proteinTag: "Ternera", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: false, baseCalories: 400, macroProfile: "alta_proteina",
    steps: ["Salpimenta {proteina} y cocina a la plancha al gusto.", "Saltea {verdura} de acompañamiento."] },
  { id: "t2", name: "{proteina} guisada con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Ternera", applianceOptions: ["Vitrocerámica"], timeMin: 60, verduraSlot: true, carbSlot: true, baseCalories: 550, macroProfile: "equilibrado",
    steps: ["Dora {proteina} en la cazuela.", "Añade {verdura} y caldo, cuece a fuego lento 45-50 min.", "Sirve con {carbohidrato}."] },
  { id: "t3", name: "{proteina} al horno con {carbohidrato}", mealType: "comida", styles: ["Favoritas en familia"], proteinTag: "Ternera", applianceOptions: ["Horno"], timeMin: 50, verduraSlot: true, carbSlot: true, baseCalories: 530, macroProfile: "alta_proteina",
    steps: ["Precalienta el horno a 200°C.", "Hornea {proteina} con {verdura} 35-40 min.", "Sirve con {carbohidrato}."] },
  { id: "t4", name: "Salteado de {proteina} con {verdura}", mealType: "cena", styles: ["Rápida", "Fakeaway"], proteinTag: "Ternera", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 460, macroProfile: "alta_proteina",
    steps: ["Corta {proteina} en tiras.", "Saltea a fuego fuerte con {verdura}.", "Sirve sobre {carbohidrato}."] },

  // ---- Pescado ----
  { id: "f1", name: "{proteina} al horno con {verdura}", mealType: "cena", styles: ["Buena digestión", "Baja en calorías"], proteinTag: "Pescado", applianceOptions: ["Horno"], timeMin: 35, verduraSlot: true, carbSlot: true, baseCalories: 380, macroProfile: "alta_proteina",
    steps: ["Precalienta el horno a 190°C.", "Coloca {proteina} y {verdura} con aceite y limón.", "Hornea 20-25 min.", "Sirve con {carbohidrato}."] },
  { id: "f2", name: "{proteina} a la plancha con {verdura}", mealType: "cena", styles: ["Rápida", "Baja en calorías", "Buena digestión"], proteinTag: "Pescado", applianceOptions: ["Vitrocerámica"], timeMin: 15, verduraSlot: true, carbSlot: false, baseCalories: 300, macroProfile: "alta_proteina",
    steps: ["Cocina {proteina} a la plancha 3-4 min por lado.", "Saltea {verdura} de acompañamiento."] },
  { id: "f3", name: "{proteina} en papillote con {verdura}", mealType: "cena", styles: ["Buena digestión", "Baja en calorías"], proteinTag: "Pescado", applianceOptions: ["Horno", "Microondas"], timeMin: 25, verduraSlot: true, carbSlot: false, baseCalories: 290, macroProfile: "alta_proteina",
    steps: ["Envuelve {proteina} y {verdura} en papel de horno con hierbas.", "Cocina 15-18 min.", "Abre con cuidado y sirve."] },
  { id: "f4", name: "{proteina} con {carbohidrato} salteado", mealType: "comida", styles: ["Rápida", "Fakeaway"], proteinTag: "Pescado", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 420, macroProfile: "equilibrado",
    steps: ["Cocina {proteina} a la plancha.", "Saltea {carbohidrato} con {verdura}.", "Sirve todo junto."] },
  { id: "f5", name: "{proteina} en freidora de aire con {verdura}", mealType: "cena", styles: ["Rápida", "Fakeaway"], proteinTag: "Pescado", applianceOptions: ["Freidora de aire"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 400, macroProfile: "alta_proteina",
    steps: ["Reboza ligeramente {proteina}.", "Cocina en freidora de aire a 190°C 12-15 min.", "Sirve con {verdura} y {carbohidrato}."] },
  { id: "f6", name: "Guiso marinero de {proteina} con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Pescado", applianceOptions: ["Vitrocerámica"], timeMin: 40, verduraSlot: true, carbSlot: true, baseCalories: 440, macroProfile: "equilibrado",
    steps: ["Sofríe {verdura} en una cazuela.", "Añade {proteina} y caldo de pescado.", "Cuece 15-20 min y sirve con {carbohidrato}."] },

  // ---- Vegetariano / legumbre ----
  { id: "v1", name: "{proteina} salteado con {verdura}", mealType: "cena", styles: ["Buena digestión", "Baja en calorías"], proteinTag: "vegetariano", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 380, macroProfile: "equilibrado",
    steps: ["Corta {proteina} en dados y dora en la sartén.", "Añade {verdura} y saltea 5 min.", "Sirve con {carbohidrato}."] },
  { id: "v2", name: "Guiso de legumbres con {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable", "Buena digestión"], proteinTag: "legumbre", applianceOptions: ["Vitrocerámica"], timeMin: 40, verduraSlot: true, carbSlot: false, baseCalories: 420, macroProfile: "equilibrado",
    steps: ["Sofríe {verdura} en una cazuela.", "Añade las legumbres y caldo, cuece 20 min.", "Rectifica de sal y sirve."] },
  { id: "v3", name: "{carbohidrato} con {verdura} salteada", mealType: "comida", styles: ["Rápida", "Baja en calorías"], proteinTag: null, applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 380, macroProfile: "equilibrado",
    steps: ["Cuece {carbohidrato} según el envase.", "Saltea {verdura} aparte.", "Mezcla ambos y sirve."] },
  { id: "v4", name: "Ensalada completa con {verdura}", mealType: "comida", styles: ["Rápida", "Baja en calorías", "Buena digestión"], proteinTag: "legumbre", applianceOptions: ["Vitrocerámica", "Microondas"], timeMin: 15, verduraSlot: true, carbSlot: false, baseCalories: 340, macroProfile: "equilibrado",
    steps: ["Trocea {verdura} en un bol.", "Añade las legumbres escurridas.", "Aliña con aceite y vinagre."] },
  { id: "v5", name: "{proteina} al horno con {verdura}", mealType: "cena", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "vegetariano", applianceOptions: ["Horno"], timeMin: 35, verduraSlot: true, carbSlot: true, baseCalories: 400, macroProfile: "equilibrado",
    steps: ["Precalienta el horno a 200°C.", "Hornea {proteina} y {verdura} 20-25 min.", "Sirve con {carbohidrato}."] },
  { id: "v6", name: "Crema de {verdura}", mealType: "cena", styles: ["Buena digestión", "Baja en calorías", "Confort saludable"], proteinTag: null, applianceOptions: ["Vitrocerámica"], timeMin: 30, verduraSlot: true, carbSlot: false, baseCalories: 260, macroProfile: "bajo_calorico",
    steps: ["Sofríe cebolla y añade {verdura} troceada.", "Cubre con caldo y cuece 20 min.", "Tritura hasta obtener una crema fina."] },
  { id: "v7", name: "Wok vegetal con {carbohidrato}", mealType: "cena", styles: ["Rápida", "Fakeaway", "Baja en calorías"], proteinTag: "vegetariano", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 400, macroProfile: "equilibrado",
    steps: ["Saltea {proteina} a fuego fuerte.", "Añade {verdura} variada y saltea 5 min.", "Sirve sobre {carbohidrato}."] },

  // ---- Pasta / arroz universales ----
  { id: "u1", name: "Pasta con {proteina} y {verdura}", mealType: "comida", styles: ["Rápida", "Favoritas en familia"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 25, verduraSlot: true, carbSlot: true, baseCalories: 500, macroProfile: "equilibrado", carbTag: "Pasta",
    steps: ["Cuece {carbohidrato} en agua con sal.", "Saltea {proteina} con {verdura}.", "Mezcla todo y sirve."] },
  { id: "u2", name: "Arroz con {proteina} y {verdura}", mealType: "comida", styles: ["Favoritas en familia", "Confort saludable"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 35, verduraSlot: true, carbSlot: true, baseCalories: 520, macroProfile: "equilibrado", carbTag: "Arroz",
    steps: ["Sofríe {verdura} y {proteina} en una cazuela.", "Añade {carbohidrato} y caldo doble.", "Cuece 18-20 min sin remover."] },
  { id: "u3", name: "Pasta con {proteina} y {verdura}", mealType: "cena", styles: ["Rápida", "Buena digestión"], proteinTag: "Pescado", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 460, macroProfile: "equilibrado", carbTag: "Pasta",
    steps: ["Cuece {carbohidrato}.", "Saltea {proteina} con {verdura} y un chorro de aceite.", "Mezcla y sirve."] },
  { id: "u4", name: "Arroz con {proteina} y {verdura}", mealType: "comida", styles: ["Favoritas en familia"], proteinTag: "Cerdo", applianceOptions: ["Vitrocerámica"], timeMin: 40, verduraSlot: true, carbSlot: true, baseCalories: 540, macroProfile: "equilibrado", carbTag: "Arroz",
    steps: ["Dora {proteina} en la cazuela.", "Añade {verdura}, {carbohidrato} y caldo.", "Cuece 18-20 min a fuego medio."] },
  { id: "u5", name: "Pasta con {proteina} y {verdura}", mealType: "cena", styles: ["Rápida", "Alta en proteína"], proteinTag: "Ternera", applianceOptions: ["Vitrocerámica"], timeMin: 25, verduraSlot: true, carbSlot: true, baseCalories: 510, macroProfile: "alta_proteina", carbTag: "Pasta",
    steps: ["Cuece {carbohidrato}.", "Dora {proteina} con {verdura}.", "Mezcla con la pasta y sirve."] },

  // ---- Fakeaway / rápidas específicas ----
  { id: "r1", name: "Hamburguesa de {proteina} con {verdura}", mealType: "cena", styles: ["Fakeaway", "Rápida"], proteinTag: "Ternera", applianceOptions: ["Vitrocerámica", "Freidora de aire"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 560, macroProfile: "alta_proteina",
    steps: ["Forma una hamburguesa con {proteina} picada.", "Cocina 4-5 min por lado.", "Monta con {carbohidrato} y {verdura}."] },
  { id: "r2", name: "Fajitas de {proteina} con {verdura}", mealType: "cena", styles: ["Fakeaway", "Favoritas en familia"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 480, macroProfile: "equilibrado", carbTag: "Wrap",
    steps: ["Saltea {proteina} en tiras con especias.", "Añade {verdura} y saltea 5 min.", "Sirve envuelto en {carbohidrato}."] },
  { id: "r3", name: "Pizza casera con {verdura}", mealType: "cena", styles: ["Fakeaway", "Favoritas en familia"], proteinTag: null, applianceOptions: ["Horno"], timeMin: 30, verduraSlot: true, carbSlot: false, baseCalories: 550, macroProfile: "equilibrado",
    steps: ["Extiende la masa y añade tomate.", "Reparte {verdura} y queso por encima.", "Hornea a 220°C 12-15 min."] },
  { id: "r4", name: "Poke bowl de {proteina} con {verdura}", mealType: "comida", styles: ["Fakeaway", "Baja en calorías", "Buena digestión"], proteinTag: "Pescado", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: true, baseCalories: 420, macroProfile: "equilibrado",
    steps: ["Cuece {carbohidrato} y deja enfriar.", "Marca {proteina} a la plancha.", "Monta el bowl con {verdura} y aliño."] },

  // ---- Alta en proteína específicas ----
  { id: "hp1", name: "{proteina} con huevo y {verdura}", mealType: "cena", styles: ["Alta en proteína", "Rápida"], proteinTag: "Pollo", applianceOptions: ["Vitrocerámica"], timeMin: 20, verduraSlot: true, carbSlot: false, baseCalories: 400, macroProfile: "alta_proteina",
    steps: ["Cocina {proteina} a la plancha.", "Añade un huevo a la plancha.", "Sirve con {verdura} salteada."] },
  { id: "hp2", name: "{proteina} con {carbohidrato} y queso", mealType: "cena", styles: ["Alta en proteína", "Confort saludable"], proteinTag: "Ternera", applianceOptions: ["Horno"], timeMin: 35, verduraSlot: true, carbSlot: true, baseCalories: 560, macroProfile: "alta_proteina",
    steps: ["Hornea {proteina} con {carbohidrato}.", "Gratina con queso los últimos 5 min.", "Sirve con {verdura}."] },
];

export const MEAL_TIME_MINUTES = { "15 min": 15, "30 min": 30, "45 min": 45, "60+ min": 90 };

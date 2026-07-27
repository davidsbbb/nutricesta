import React, { useState, useEffect } from "react";
import {
  ShoppingCart, ChefHat, Settings, Plus, Trash2, Loader2,
  TrendingDown, Clock, Flame, Ticket, Users, Wallet, History,
  ChevronDown, ChevronUp, AlertCircle, Utensils, KeyRound, Check,
  Sparkles, ClipboardList
} from "lucide-react";

const SUPERMARKETS = ["Mercadona", "Día", "Eroski", "Carrefour", "Carrefour Express", "Lidl", "Aldi"];
const ALLERGIES = ["Lactosa", "Gluten", "Frutos secos", "Huevo", "Marisco", "Soja"];
const STYLES = ["Rápida", "Baja en calorías", "Favoritas en familia", "Confort saludable", "Fakeaway", "Buena digestión", "Alta en proteína"];
const PROTEINS = ["Ternera", "Cerdo", "Pollo", "Pescado"];
const APPLIANCES = ["Freidora de aire", "Vitrocerámica", "Horno", "Microondas"];
const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TIME_OPTIONS = ["15 min", "30 min", "45 min", "60+ min"];
const ACTIVITY_FACTORS = { "Sedentario": 1.2, "Ligero": 1.375, "Moderado": 1.55, "Alto": 1.725, "Muy alto": 1.9 };
const GOAL_ADJUST = { "Perder grasa": 0.8, "Ganar masa muscular": 1.1, "Mantenimiento": 1.0, "Rendimiento deportivo": 1.05 };

const LS = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

const emptyPrefs = () => ({
  budgetAmount: "", budgetPeriod: "Semanal", people: 2,
  supermarkets: ["Mercadona"], allergies: ["Lactosa"], extraAllergyNote: "",
  days: [], style: "Favoritas en familia", proteins: ["Pollo"], appliances: ["Vitrocerámica", "Horno"],
  nutriEnabled: false, goal: "Mantenimiento", weight: "", height: "", age: "", sex: "Mujer", activity: "Moderado"
});

function getApiKey() {
  return localStorage.getItem("nutricesta_api_key") || import.meta.env.VITE_ANTHROPIC_API_KEY || "";
}

async function callClaude(system, userPrompt, useSearch = true) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Falta la API key. Añádela arriba en Ajustes.");
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Error de la API");
  const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
  const raw = textBlocks[textBlocks.length - 1] || "";
  const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("Respuesta no interpretable");
  return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
}

function computeMacros(prefs) {
  const w = parseFloat(prefs.weight), h = parseFloat(prefs.height), a = parseFloat(prefs.age);
  if (!w || !h || !a) return null;
  const bmr = prefs.sex === "Hombre" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * (ACTIVITY_FACTORS[prefs.activity] || 1.375);
  const target = Math.round(tdee * (GOAL_ADJUST[prefs.goal] || 1));
  const proteinPerKg = prefs.goal === "Ganar masa muscular" ? 2.2 : 1.8;
  const protein_g = Math.round(w * proteinPerKg);
  const fat_g = Math.round((target * 0.25) / 9);
  const carbs_g = Math.max(0, Math.round((target - protein_g * 4 - fat_g * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), target, protein_g, fat_g, carbs_g };
}

function todayEs() {
  return new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function Toggle({ items, active, onChange, single = false }) {
  const toggle = (item) => {
    if (single) return onChange(item);
    if (active.includes(item)) onChange(active.filter((i) => i !== item));
    else onChange([...active, item]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = single ? active === item : active.includes(item);
        return (
          <button key={item} type="button" onClick={() => toggle(item)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border font-medium transition-all duration-200 active:scale-95 ${
              isActive
                ? "bg-[#7A2E1D] text-[#FBF3E7] border-[#7A2E1D] shadow-md shadow-[#7A2E1D]/20 scale-100"
                : "bg-white/50 text-[#3A342C] border-[#D8CEB8] hover:border-[#7A2E1D] hover:bg-white hover:-translate-y-0.5"
            }`}>
            <Check size={13} className={`transition-all duration-200 ${isActive ? "opacity-100 scale-100 w-3.5" : "opacity-0 scale-0 w-0"}`} />
            {item}
          </button>
        );
      })}
    </div>
  );
}

function Section({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#D8CEB8] rounded-xl bg-[#FBF3E7]/70 mb-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#7A2E1D]/[0.04] transition-colors">
        <span className="flex items-center gap-2.5 font-semibold text-[#3A342C] tracking-wide">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#7A2E1D]/10">
            <Icon size={16} className="text-[#7A2E1D]" />
          </span>
          {title}
        </span>
        <ChevronDown size={18} className={`text-[#9A927E] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(getApiKey());
  const [prefs, setPrefs] = useState(() => LS.get("nutricesta_prefs", emptyPrefs()));
  const [tab, setTab] = useState("prefs");
  const [plan, setPlan] = useState(() => LS.get("nutricesta_plan", null));
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [recipes, setRecipes] = useState({});
  const [recipeLoading, setRecipeLoading] = useState(null);
  const [history, setHistory] = useState(() => LS.get("nutricesta_history", []));

  useEffect(() => { LS.set("nutricesta_prefs", prefs); }, [prefs]);
  useEffect(() => { LS.set("nutricesta_plan", plan); }, [plan]);
  useEffect(() => { LS.set("nutricesta_history", history); }, [history]);

  const saveApiKey = (v) => { setApiKey(v); localStorage.setItem("nutricesta_api_key", v); };

  const addDay = () => setPrefs((p) => ({ ...p, days: [...p.days, { id: Date.now(), day: "Lunes", time: "30 min", meals: 2 }] }));
  const updateDay = (id, field, value) => setPrefs((p) => ({ ...p, days: p.days.map((d) => (d.id === id ? { ...d, [field]: value } : d)) }));
  const removeDay = (id) => setPrefs((p) => ({ ...p, days: p.days.filter((d) => d.id !== id) }));

  const macros = computeMacros(prefs);

  const generatePlan = async () => {
    setPlanLoading(true); setPlanError(""); setPlan(null); setRecipes({});
    try {
      const allAllergies = [...prefs.allergies, prefs.extraAllergyNote].filter(Boolean).join(", ");
      const system = `Eres un nutricionista experto y planificador de compra doméstico español. Fecha de hoy: ${todayEs()}. Busca precios REALES actuales en supermercados españoles con la herramienta de búsqueda web antes de responder; no inventes precios. Nunca superes el presupuesto indicado, bajo ningún concepto; si puedes ahorrar sin perder variedad, hazlo. Respeta estrictamente las alergias/intolerancias. Tu ÚLTIMO mensaje debe contener ÚNICAMENTE un JSON válido, sin texto adicional ni markdown, con este esquema exacto: {"resumen":{"presupuesto_disponible":number,"estimado_gastado":number,"ahorro":number,"moneda":"EUR"},"menu":[{"dia":"string","comidas":["string"]}],"lista_compra":[{"supermercado":"string","items":[{"producto":"string","cantidad":"string","precio_estimado":number}],"total":number}],"aviso_ahorro":"string"}`;
      const userPrompt = JSON.stringify({
        presupuesto: prefs.budgetAmount, periodo: prefs.budgetPeriod, personas: prefs.people,
        supermercados: prefs.supermarkets, alergias: allAllergies || "Lactosa",
        dias_cocina: prefs.days.map((d) => ({ dia: d.day, tiempo: d.time, comidas: d.meals })),
        estilo: prefs.style, proteinas_preferidas: prefs.proteins, electrodomesticos: prefs.appliances,
        modo_nutricionista: prefs.nutriEnabled, objetivo_calorico: prefs.nutriEnabled && macros ? macros.target : null,
        macros_objetivo: prefs.nutriEnabled && macros ? { proteina_g: macros.protein_g, grasa_g: macros.fat_g, carbohidratos_g: macros.carbs_g } : null,
      });
      const result = await callClaude(system, userPrompt, true);
      setPlan(result);
      const entry = { id: Date.now(), date: todayEs(), gastado: result?.resumen?.estimado_gastado ?? null, ahorro: result?.resumen?.ahorro ?? null };
      setHistory((h) => [entry, ...h].slice(0, 20));
      setTab("plan");
    } catch (e) {
      setPlanError(e.message || "No se pudo generar el plan. Inténtalo de nuevo.");
    } finally {
      setPlanLoading(false);
    }
  };

  const loadRecipe = async (dayName) => {
    if (recipes[dayName]) return;
    setRecipeLoading(dayName);
    try {
      const allAllergies = [...prefs.allergies, prefs.extraAllergyNote].filter(Boolean).join(", ");
      const dayInfo = prefs.days.find((d) => d.day === dayName) || { time: "30 min", meals: 2 };
      const system = `Eres un nutricionista experto. Tu ÚLTIMO mensaje debe contener ÚNICAMENTE un JSON válido, sin texto adicional, con este esquema: {"dia":"string","comidas":[{"nombre":"string","ingredientes":[{"item":"string","cantidad":"string"}],"pasos":["string"],"tiempo_min":number,"electrodomestico":"string","calorias_estimadas":number,"macros":{"proteina_g":number,"carbohidratos_g":number,"grasa_g":number}}]}. Ajusta cantidades para el número de personas indicado, respeta alergias y usa solo los electrodomésticos disponibles.`;
      const userPrompt = JSON.stringify({
        dia: dayName, personas: prefs.people, tiempo_disponible: dayInfo.time, numero_comidas: dayInfo.meals,
        alergias: allAllergies || "Lactosa", estilo: prefs.style, proteinas_preferidas: prefs.proteins,
        electrodomesticos: prefs.appliances, objetivo_calorico_por_comida: prefs.nutriEnabled && macros ? Math.round(macros.target / (dayInfo.meals || 1)) : null,
      });
      const result = await callClaude(system, userPrompt, false);
      setRecipes((prev) => ({ ...prev, [dayName]: result }));
    } catch (e) {
      setRecipes((prev) => ({ ...prev, [dayName]: { error: e.message || "No se pudo generar la receta." } }));
    } finally {
      setRecipeLoading(null);
    }
  };

  const TABS = [
    { id: "prefs", label: "Preferencias", icon: Settings },
    { id: "plan", label: "Plan semanal", icon: ChefHat },
    { id: "history", label: "Historial", icon: History },
  ];
  const tabIndex = Math.max(0, TABS.findIndex((t) => t.id === tab));

  return (
    <div className="min-h-screen bg-[#F1E9D8] text-[#3A342C]">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-[#7A2E1D] to-[#9A4028] text-[#FBF3E7] px-4 py-4 flex items-center justify-between shadow-lg shadow-[#7A2E1D]/10">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex animate-float">
            <Ticket className="drop-shadow" size={24} />
          </span>
          <div>
            <span className="font-display font-bold text-xl tracking-wide leading-none block">NutriCesta</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#FBF3E7]/70">Compra lista, presupuesto a salvo</span>
          </div>
        </div>
        <Sparkles size={18} className="text-[#FBF3E7]/60" />
      </header>

      <nav className="relative flex border-b border-[#D8CEB8] bg-[#FBF3E7] sticky top-[60px] z-10 shadow-sm">
        <div
          className="absolute bottom-0 h-[3px] bg-[#7A2E1D] rounded-full transition-all duration-300 ease-out"
          style={{ width: `${100 / TABS.length}%`, left: `${(100 / TABS.length) * tabIndex}%` }}
        />
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-200 ${tab === t.id ? "text-[#7A2E1D]" : "text-[#9A927E] hover:text-[#7A2E1D]/70"}`}>
            <t.icon size={17} className={`transition-transform duration-200 ${tab === t.id ? "scale-110" : ""}`} /> {t.label}
          </button>
        ))}
      </nav>

      <main key={tab} className="animate-fade-in p-4 max-w-lg mx-auto pb-24">
        {tab === "prefs" && (
          <>
            <Section icon={KeyRound} title="API key de Anthropic" defaultOpen={!apiKey}>
              <p className="text-xs text-[#6B6252] mb-2">
                Solo para pruebas locales. Consíguela en console.anthropic.com/settings/keys. No la compartas, no la subas a ningún repositorio público.
              </p>
              <input type="password" value={apiKey} onChange={(e) => saveApiKey(e.target.value)} placeholder="sk-ant-..."
                className="w-full px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" />
            </Section>

            <Section icon={Wallet} title="Presupuesto y personas">
              <div className="flex gap-2 mb-3">
                <input type="number" placeholder="Importe €" value={prefs.budgetAmount}
                  onChange={(e) => setPrefs({ ...prefs, budgetAmount: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" />
                <select value={prefs.budgetPeriod} onChange={(e) => setPrefs({ ...prefs, budgetPeriod: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all">
                  <option>Semanal</option><option>Mensual</option>
                </select>
              </div>
              <label className="text-sm text-[#6B6252] flex items-center gap-2 mb-1"><Users size={14} /> Personas</label>
              <input type="number" min={1} value={prefs.people} onChange={(e) => setPrefs({ ...prefs, people: e.target.value })}
                className="w-24 px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" />
            </Section>

            <Section icon={ShoppingCart} title="Supermercados">
              <Toggle items={SUPERMARKETS} active={prefs.supermarkets} onChange={(v) => setPrefs({ ...prefs, supermarkets: v })} />
            </Section>

            <Section icon={AlertCircle} title="Intolerancias y alergias">
              <p className="text-xs text-[#6B6252] mb-2">Marca todas las que apliquen. La lactosa viene preseleccionada.</p>
              <Toggle items={ALLERGIES} active={prefs.allergies}
                onChange={(v) => setPrefs({ ...prefs, allergies: v })} />
              <input value={prefs.extraAllergyNote} onChange={(e) => setPrefs({ ...prefs, extraAllergyNote: e.target.value })}
                placeholder="Otra (especificar)" className="mt-2 w-full px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 transition-shadow" />
            </Section>

            <Section icon={Clock} title="Días que cocino">
              {prefs.days.map((d) => (
                <div key={d.id} className="flex gap-2 items-center mb-2">
                  <select value={d.day} onChange={(e) => updateDay(d.id, "day", e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D8CEB8] bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all">
                    {DAY_NAMES.map((n) => <option key={n}>{n}</option>)}
                  </select>
                  <select value={d.time} onChange={(e) => updateDay(d.id, "time", e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D8CEB8] bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all">
                    {TIME_OPTIONS.map((n) => <option key={n}>{n}</option>)}
                  </select>
                  <input type="number" min={1} max={4} value={d.meals} onChange={(e) => updateDay(d.id, "meals", e.target.value)}
                    className="w-14 px-2 py-1.5 rounded-lg border border-[#D8CEB8] bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" title="Nº comidas" />
                  <button onClick={() => removeDay(d.id)} className="text-[#9A5040]"><Trash2 size={16} /></button>
                </div>
              ))}
              <button onClick={addDay} className="flex items-center gap-1 text-sm text-[#7A2E1D] font-medium mt-1"><Plus size={15} /> Añadir día</button>
            </Section>

            <Section icon={Utensils} title="Estilo y proteína">
              <p className="text-xs text-[#6B6252] mb-1">Estilo de comida</p>
              <Toggle items={STYLES} active={prefs.style} onChange={(v) => setPrefs({ ...prefs, style: v })} single />
              <p className="text-xs text-[#6B6252] mb-1 mt-3">Proteínas preferidas</p>
              <Toggle items={PROTEINS} active={prefs.proteins} onChange={(v) => setPrefs({ ...prefs, proteins: v })} />
              <p className="text-xs text-[#6B6252] mb-1 mt-3">Electrodomésticos disponibles</p>
              <Toggle items={APPLIANCES} active={prefs.appliances} onChange={(v) => setPrefs({ ...prefs, appliances: v })} />
            </Section>

            <Section icon={Flame} title="Modo nutricionista" defaultOpen={false}>
              <label className="flex items-center gap-2 mb-3 text-sm">
                <input type="checkbox" checked={prefs.nutriEnabled} onChange={(e) => setPrefs({ ...prefs, nutriEnabled: e.target.checked })} />
                Activar cálculo de calorías y macros
              </label>
              {prefs.nutriEnabled && (
                <div className="space-y-2">
                  <Toggle items={Object.keys(GOAL_ADJUST)} active={prefs.goal} onChange={(v) => setPrefs({ ...prefs, goal: v })} single />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input type="number" placeholder="Peso (kg)" value={prefs.weight} onChange={(e) => setPrefs({ ...prefs, weight: e.target.value })} className="px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" />
                    <input type="number" placeholder="Altura (cm)" value={prefs.height} onChange={(e) => setPrefs({ ...prefs, height: e.target.value })} className="px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" />
                    <input type="number" placeholder="Edad" value={prefs.age} onChange={(e) => setPrefs({ ...prefs, age: e.target.value })} className="px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all" />
                    <select value={prefs.sex} onChange={(e) => setPrefs({ ...prefs, sex: e.target.value })} className="px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all">
                      <option>Mujer</option><option>Hombre</option>
                    </select>
                  </div>
                  <select value={prefs.activity} onChange={(e) => setPrefs({ ...prefs, activity: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[#D8CEB8] bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#7A2E1D]/30 focus:border-[#7A2E1D] transition-all">
                    {Object.keys(ACTIVITY_FACTORS).map((a) => <option key={a}>{a}</option>)}
                  </select>
                  {macros && (
                    <div className="mt-3 p-3 rounded-lg bg-[#FBF3E7] border border-dashed border-[#B9AF9C] text-sm">
                      <p><b>Objetivo diario:</b> {macros.target} kcal</p>
                      <p className="text-[#6B6252]">Proteína {macros.protein_g} g · Grasa {macros.fat_g} g · Carbohidratos {macros.carbs_g} g</p>
                    </div>
                  )}
                </div>
              )}
            </Section>

            <button onClick={generatePlan} disabled={planLoading || !prefs.budgetAmount || prefs.days.length === 0 || !apiKey}
              className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-[#7A2E1D] to-[#9A4028] text-[#FBF3E7] font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#7A2E1D]/25 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none">
              {planLoading ? <Loader2 size={18} className="animate-spin" /> : <ChefHat size={18} />}
              {planLoading ? "Generando (buscando precios reales)…" : "Generar plan semanal"}
            </button>
            {(!prefs.budgetAmount || prefs.days.length === 0) && (
              <p className="text-xs text-center text-[#9A5040] mt-2">Indica presupuesto y al menos un día de cocina.</p>
            )}
            {!apiKey && <p className="text-xs text-center text-[#9A5040] mt-2">Añade tu API key arriba para poder generar el plan.</p>}
            {planError && <p className="text-sm text-[#9A5040] mt-2 flex items-center gap-1"><AlertCircle size={14} /> {planError}</p>}
          </>
        )}

        {tab === "plan" && (
          <>
            {!plan && (
              <div className="flex flex-col items-center text-center gap-3 py-16 px-4 rounded-2xl border-2 border-dashed border-[#D8CEB8] bg-[#FBF3E7]/40">
                <span className="flex items-center justify-center w-16 h-16 rounded-full bg-[#7A2E1D]/10 animate-float">
                  <ChefHat size={28} className="text-[#7A2E1D]" />
                </span>
                <p className="text-sm text-[#6B6252] max-w-[220px]">Aún no has generado un plan. Ve a "Preferencias" y pulsa "Generar plan semanal".</p>
              </div>
            )}
            {plan && (
              <>
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#FBF3E7] to-[#F1E9D8] border border-[#D8CEB8] mb-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1 text-[#7A2E1D]">
                    <ClipboardList size={16} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Resumen</span>
                  </div>
                  <p className="text-sm">Presupuesto: <b>{plan.resumen?.presupuesto_disponible} €</b> — Estimado: <b>{plan.resumen?.estimado_gastado} €</b></p>
                  {plan.resumen?.ahorro > 0 && (
                    <p className="text-sm text-[#3E6B4A] flex items-center gap-1 mt-1 font-medium"><TrendingDown size={14} /> Ahorro estimado: {plan.resumen.ahorro} €</p>
                  )}
                  {plan.aviso_ahorro && <p className="text-xs text-[#6B6252] mt-1">{plan.aviso_ahorro}</p>}
                </div>

                <h3 className="font-display font-semibold text-lg mb-2">Menú de la semana</h3>
                {(plan.menu || []).map((d) => (
                  <div key={d.dia} className="mb-2 border border-[#D8CEB8] rounded-lg bg-white/50 overflow-hidden shadow-sm hover:shadow-md hover:border-[#7A2E1D]/40 transition-all duration-200">
                    <button onClick={() => loadRecipe(d.dia)} className="w-full flex items-center justify-between px-4 py-2.5 text-left group">
                      <span className="font-medium">{d.dia}</span>
                      <span className="text-xs text-[#7A2E1D] font-medium flex items-center gap-1">
                        {recipes[d.dia] ? "Ver receta" : recipeLoading === d.dia ? "Cargando…" : "Ver receta"}
                        {!recipes[d.dia] && recipeLoading !== d.dia && <ChevronDown size={13} className="transition-transform group-hover:translate-y-0.5" />}
                        {recipes[d.dia] && <ChevronUp size={13} />}
                      </span>
                    </button>
                    <p className="px-4 pb-2 text-sm text-[#6B6252]">{(d.comidas || []).join(" · ")}</p>
                    {recipeLoading === d.dia && <div className="px-4 pb-3"><Loader2 size={16} className="animate-spin text-[#7A2E1D]" /></div>}
                    {recipes[d.dia] && !recipes[d.dia].error && (
                      <div className="px-4 pb-3 space-y-3">
                        {(recipes[d.dia].comidas || []).map((c, i) => (
                          <div key={i} className="text-sm border-t border-dashed border-[#D8CEB8] pt-2">
                            <p className="font-medium">{c.nombre}</p>
                            <p className="text-xs text-[#6B6252] mb-1">{c.tiempo_min} min · {c.electrodomestico} · {c.calorias_estimadas} kcal</p>
                            <ul className="list-disc list-inside text-xs text-[#4A4438]">
                              {(c.ingredientes || []).map((ing, j) => <li key={j}>{ing.cantidad} {ing.item}</li>)}
                            </ul>
                            <ol className="list-decimal list-inside text-xs mt-1 space-y-0.5">
                              {(c.pasos || []).map((p, j) => <li key={j}>{p}</li>)}
                            </ol>
                          </div>
                        ))}
                      </div>
                    )}
                    {recipes[d.dia]?.error && <p className="px-4 pb-3 text-xs text-[#9A5040]">{recipes[d.dia].error}</p>}
                  </div>
                ))}

                <h3 className="font-display font-semibold text-lg mt-5 mb-2">Lista de la compra</h3>
                {(plan.lista_compra || []).map((s) => (
                  <div key={s.supermercado} className="mb-4 rounded-lg bg-white/60 border border-[#D8CEB8] p-3 font-receipt text-xs shadow-sm relative before:content-[''] before:absolute before:-top-1 before:left-0 before:right-0 before:h-1 before:bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,#D8CEB8_4px,#D8CEB8_8px)]">
                    <p className="font-bold text-sm mb-1 font-sans flex items-center gap-1.5"><ShoppingCart size={13} className="text-[#7A2E1D]" /> {s.supermercado}</p>
                    {(s.items || []).map((it, i) => (
                      <div key={i} className="flex justify-between border-b border-dotted border-[#D8CEB8] py-0.5">
                        <span>{it.producto} <span className="text-[#9A927E]">×{it.cantidad}</span></span>
                        <span>{it.precio_estimado?.toFixed ? it.precio_estimado.toFixed(2) : it.precio_estimado} €</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold pt-1 mt-1 border-t border-[#B9AF9C]">
                      <span>TOTAL</span><span>{s.total} €</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {history.length === 0 && (
              <div className="flex flex-col items-center text-center gap-3 py-16 px-4 rounded-2xl border-2 border-dashed border-[#D8CEB8] bg-[#FBF3E7]/40">
                <span className="flex items-center justify-center w-16 h-16 rounded-full bg-[#7A2E1D]/10 animate-float">
                  <History size={28} className="text-[#7A2E1D]" />
                </span>
                <p className="text-sm text-[#6B6252] max-w-[220px]">Todavía no hay planes guardados. Cuando generes uno, aparecerá aquí.</p>
              </div>
            )}
            {history.map((h) => (
              <div key={h.id} className="mb-2 p-3 rounded-lg bg-[#FBF3E7] border border-[#D8CEB8] flex justify-between text-sm shadow-sm hover:shadow-md hover:border-[#7A2E1D]/40 transition-all duration-200">
                <span>{h.date}</span>
                <span>{h.gastado != null ? `${h.gastado} €` : "—"} {h.ahorro > 0 && <span className="text-[#3E6B4A] font-medium">(ahorro {h.ahorro} €)</span>}</span>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type Section = "inicio" | "recetas" | "compra" | "favoritas";
type RecipeKind = "Comida" | "Cena";
type TimeBand = "quick" | "medium" | "slow";

type Config = {
  adults: 1 | 2;
  children: 0 | 1 | 2;
  lunches: number;
  dinners: number;
  timeBand: TimeBand;
  tools: string[];
  otherTool: string;
  allergies: string;
  avoid: string;
};

type Ingredient = {
  name: string;
  amount: number;
  unit: string;
  category: string;
  staple?: boolean;
};

type Recipe = {
  id: string;
  title: string;
  emoji: string;
  kind: RecipeKind;
  mode: "Low carb" | "Familiar";
  activeMinutes: number;
  totalMinutes: number;
  servings: number;
  difficulty: "Fácil" | "Muy fácil";
  tools: string[];
  calories: number;
  protein: number;
  carbs: number;
  ingredients: Ingredient[];
  steps: string[];
  stepsVersion?: number;
  childNote?: string;
  source?: "ai" | "fallback";
};

type ShoppingItem = Ingredient & { checked: boolean };

type RecipeSummary = {
  title: string;
  mainIngredients: string[];
  cookingMethod: string;
  mainAccompaniments: string[];
};

class RecipeGenerationError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

const DEFAULT_CONFIG: Config = {
  adults: 2,
  children: 0,
  lunches: 2,
  dinners: 2,
  timeBand: "quick",
  tools: ["Sartén", "Horno"],
  otherTool: "",
  allergies: "",
  avoid: "",
};

const TOOLS = ["Sartén", "Olla rápida", "Thermomix", "Airfryer", "Horno", "Microondas"];
const CATEGORIES = ["Frutas y verduras", "Carnicería", "Pescadería", "Huevos y refrigerados", "Legumbres, arroz y pasta", "Otros"];
const PROTEINS = [
  { name: "pechuga de pollo", emoji: "🍗", category: "Carnicería" },
  { name: "pavo", emoji: "🥘", category: "Carnicería" },
  { name: "salmón", emoji: "🐟", category: "Pescadería" },
  { name: "merluza", emoji: "🐠", category: "Pescadería" },
  { name: "huevos", emoji: "🍳", category: "Huevos y refrigerados" },
  { name: "garbanzos cocidos", emoji: "🫘", category: "Legumbres, arroz y pasta" },
];
const VEGETABLES = [
  ["calabacín", "pimiento rojo"], ["brócoli", "zanahoria"], ["berenjena", "tomate"],
  ["espinacas", "champiñones"], ["judías verdes", "tomates cherry"], ["calabaza", "puerro"],
];
const FAMILY_SIDES = [
  { name: "arroz integral", unit: "g", perAdult: 60, perChild: 50 },
  { name: "patata", unit: "g", perAdult: 180, perChild: 140 },
  { name: "cuscús integral", unit: "g", perAdult: 60, perChild: 50 },
  { name: "pasta integral", unit: "g", perAdult: 70, perChild: 55 },
  { name: "pan integral", unit: "g", perAdult: 50, perChild: 40 },
];
function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function titleKey(value: string) {
  return cleanFoodText(value);
}

function sentenceCase(value: string) {
  const clean = value.replace(/\s+/g, " ").trim().replace(/[.!:;,]+$/g, "");
  return clean ? `${clean[0].toUpperCase()}${clean.slice(1)}` : clean;
}

function cleanFoodText(value: string) {
  return normalize(value).replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
}

function wordVariants(word: string) {
  const variants = new Set([word]);
  const irregular: Record<string, string> = { coles: "col", nueces: "nuez", arroces: "arroz" };
  if (irregular[word]) variants.add(irregular[word]);
  if (word.endsWith("ces") && word.length > 4) variants.add(`${word.slice(0, -3)}z`);
  if (word.endsWith("es") && word.length > 4) {
    variants.add(word.slice(0, -1));
    variants.add(word.slice(0, -2));
  }
  if (word.endsWith("s") && word.length > 3) variants.add(word.slice(0, -1));
  return variants;
}

function equivalentWords(first: string, second: string) {
  const firstVariants = wordVariants(first);
  return [...wordVariants(second)].some((variant) => firstVariants.has(variant));
}

function foodMatchesTerm(food: string, term: string) {
  const cleanFood = cleanFoodText(food);
  const cleanTerm = cleanFoodText(term);
  if (!cleanTerm) return false;
  if (cleanFood.includes(cleanTerm) || cleanTerm.includes(cleanFood)) return true;
  const ignored = new Set(["de", "del", "la", "el", "los", "las", "un", "una"]);
  const foodWords = cleanFood.split(" ").filter(Boolean);
  const termWords = cleanTerm.split(" ").filter((word) => word && !ignored.has(word));
  return termWords.length > 0 && termWords.every((termWord) => foodWords.some((foodWord) => equivalentWords(termWord, foodWord)));
}

function canonicalTool(tool: string) {
  const value = normalize(tool);
  if (value.includes("sarten") || value.includes("plancha")) return "Sartén";
  if (value.includes("olla") || value.includes("cazuela")) return "Olla rápida";
  if (value.includes("thermomix") || value.includes("robot")) return "Thermomix";
  if (value.includes("airfryer") || value.includes("freidora")) return "Airfryer";
  if (value.includes("horno")) return "Horno";
  if (value.includes("microondas")) return "Microondas";
  return "Otro";
}

function canonicalCookingMethod(value: string) {
  const method = cleanFoodText(value);
  if (method.includes("airfryer") || method.includes("freidora")) return "airfryer";
  if (method.includes("horno") || method.includes("asado")) return "horno";
  if (method.includes("sarten") || method.includes("plancha") || method.includes("salteado")) return "sarten";
  if (method.includes("olla") || method.includes("guiso") || method.includes("estofado")) return "olla";
  if (method.includes("thermomix") || method.includes("robot")) return "thermomix";
  if (method.includes("microondas")) return "microondas";
  if (method.includes("vapor")) return "vapor";
  return method;
}

function ingredientKey(value: string) {
  const ignored = new Set([
    "de", "del", "la", "el", "los", "las", "con", "sin", "fresco", "fresca",
    "frescos", "frescas", "cocido", "cocida", "cocidos", "cocidas", "filete",
    "filetes", "pechuga", "lomos", "lomo",
  ]);
  return cleanFoodText(value).split(" ").filter((word) => word && !ignored.has(word)).join(" ");
}

function recipeSummary(recipe: Recipe): RecipeSummary {
  const substantial = recipe.ingredients.filter((ingredient) => !ingredient.staple && ingredient.category !== "Otros");
  const primary = substantial.find((ingredient) =>
    ["Carnicería", "Pescadería", "Huevos y refrigerados"].includes(ingredient.category),
  ) ?? substantial[0];
  const accompaniments = substantial.filter((ingredient) => ingredient !== primary).slice(0, 3);
  const mainIngredients = primary ? [primary, ...accompaniments] : accompaniments;
  return {
    title: sentenceCase(recipe.title),
    mainIngredients: mainIngredients.map((ingredient) => ingredient.name),
    cookingMethod: canonicalCookingMethod(`${recipe.tools[0] ?? ""} ${recipe.title} ${recipe.steps.join(" ")}`),
    mainAccompaniments: accompaniments.map((ingredient) => ingredient.name),
  };
}

function sameIngredient(first: string, second: string) {
  const firstKey = ingredientKey(first);
  const secondKey = ingredientKey(second);
  return Boolean(firstKey && secondKey && foodMatchesTerm(firstKey, secondKey));
}

function recipesAreDuplicate(first: RecipeSummary, second: RecipeSummary) {
  if (titleKey(first.title) === titleKey(second.title)) return true;
  const matchingAccompaniments = first.mainAccompaniments.filter((ingredient) =>
    second.mainAccompaniments.some((candidate) => sameIngredient(ingredient, candidate)),
  ).length;
  return sameIngredient(first.mainIngredients[0] ?? "", second.mainIngredients[0] ?? "")
    && canonicalCookingMethod(first.cookingMethod) === canonicalCookingMethod(second.cookingMethod)
    && matchingAccompaniments >= Math.min(2, first.mainAccompaniments.length, second.mainAccompaniments.length)
    && first.mainAccompaniments.length > 0
    && second.mainAccompaniments.length > 0;
}

function pickProtein(seed: number, restrictions: string, tool: string) {
  const cookingTool = canonicalTool(tool);
  const available = PROTEINS.filter((protein) => {
    if (ingredientIsRestricted(protein.name, protein.category, restrictions)) return false;
    if (cookingTool === "Olla rápida" && !["pechuga de pollo", "pavo", "garbanzos cocidos"].includes(protein.name)) return false;
    if (["Horno", "Airfryer", "Thermomix"].includes(cookingTool) && protein.name === "huevos") return false;
    return true;
  });
  return available[seed % Math.max(available.length, 1)] ?? PROTEINS[0];
}

function restrictionTerms(restrictions: string) {
  return normalize(restrictions)
    .split(/[,;\n]|\s+y\s+/)
    .map(cleanFoodText)
    .filter((term) => term.length > 2);
}

function ingredientIsRestricted(name: string, category: string, restrictions: string) {
  const terms = restrictionTerms(restrictions);
  if (terms.some((term) => foodMatchesTerm(name, term))) return true;
  if (category === "Pescadería" && terms.some((term) => ["pescado", "pescados", "marisco", "mariscos"].some((group) => foodMatchesTerm(group, term)))) return true;
  if (category === "Carnicería" && terms.some((term) => foodMatchesTerm("carne", term))) return true;
  if (category === "Huevos y refrigerados" && terms.some((term) => foodMatchesTerm("huevo", term))) return true;
  if (category === "Legumbres, arroz y pasta" && name.includes("garbanzo") && terms.some((term) => foodMatchesTerm("legumbre", term))) return true;
  if (category === "Frutas y verduras" && terms.some((term) => foodMatchesTerm("verdura", term))) return true;
  return false;
}

function pickVegetables(seed: number, restrictions: string) {
  const available = VEGETABLES.filter((pair) => !pair.some((vegetable) => ingredientIsRestricted(vegetable, "Frutas y verduras", restrictions)));
  return available[seed % Math.max(available.length, 1)] ?? ["calabacín", "pimiento rojo"];
}

function pickFamilySide(seed: number, restrictions: string, tool: string) {
  const cookingTool = canonicalTool(tool);
  const suitableSides: Record<string, string[]> = {
    "Sartén": ["patata", "pan integral"],
    "Olla rápida": ["arroz integral", "patata"],
    Thermomix: ["arroz integral", "patata"],
    Airfryer: ["patata"],
    Horno: ["patata"],
    Microondas: ["patata"],
    Otro: ["pan integral", "patata"],
  };
  const available = FAMILY_SIDES.filter((side) => {
    if (!suitableSides[cookingTool].includes(side.name)) return false;
    if (restrictionTerms(restrictions).some((term) => foodMatchesTerm("gluten", term)) && ["cuscús integral", "pasta integral", "pan integral"].includes(side.name)) return false;
    return !ingredientIsRestricted(side.name, "Legumbres, arroz y pasta", restrictions);
  });
  return available[seed % Math.max(available.length, 1)] ?? { name: "patata", unit: "g", perAdult: 180, perChild: 140 };
}

function vegetablePreparation(name: string) {
  const instructions: Record<string, string> = {
    calabacín: "Lava el calabacín, retira los extremos y córtalo en medias lunas de un centímetro.",
    "pimiento rojo": "Lava el pimiento, elimina el tallo y las semillas y córtalo en tiras.",
    brócoli: "Lava el brócoli y sepáralo en ramilletes pequeños para que se cocinen por igual.",
    zanahoria: "Pela la zanahoria y córtala en rodajas finas.",
    berenjena: "Lava la berenjena, retira el extremo y córtala en dados de unos dos centímetros.",
    tomate: "Lava el tomate y córtalo en dados, conservando el jugo.",
    espinacas: "Lava y escurre bien las espinacas; déjalas enteras si las hojas son pequeñas.",
    champiñones: "Limpia los champiñones con un paño húmedo, retira la parte seca del pie y córtalos en láminas.",
    "judías verdes": "Lava las judías verdes, retira las puntas y córtalas en trozos de cuatro centímetros.",
    "tomates cherry": "Lava los tomates cherry y córtalos por la mitad.",
    calabaza: "Pela la calabaza, retira las semillas y córtala en dados pequeños.",
    puerro: "Retira la raíz y la parte verde dura del puerro, lávalo entre las capas y córtalo en rodajas finas.",
  };
  return instructions[name] ?? `Lava ${name} y córtalo en piezas pequeñas de tamaño parecido.`;
}

function proteinPreparation(name: string) {
  if (name === "huevos") return "Casca los huevos en un bol y bátelos con un tenedor hasta integrar claras y yemas.";
  if (name === "garbanzos cocidos") return "Pon los garbanzos en un colador, enjuágalos bajo el grifo y déjalos escurrir bien. No es necesario cortarlos.";
  if (name === "salmón" || name === "merluza") return `Revisa ${name} y retira las espinas visibles. Sécalo con papel de cocina y divídelo en porciones.`;
  return `Corta ${name} en dados de unos tres centímetros, sécalos con papel de cocina y sazónalos ligeramente.`;
}

function familySidePreparation(name: string) {
  if (name === "patata") return "Lava y pela la patata y córtala en dados de aproximadamente un centímetro para que se cocine con rapidez.";
  if (name === "arroz integral") return "Pon el arroz integral en un colador y acláralo bajo el grifo hasta que el agua salga casi transparente.";
  if (name === "pan integral") return "Reserva el pan integral para servirlo junto al plato; no necesita preparación previa.";
  return `Mide la cantidad indicada de ${name} y resérvala para la cocción.`;
}

function buildRecipeTitle(options: {
  protein: string;
  vegetables: string[];
  family: boolean;
  side: { name: string };
  primaryTool: string;
}) {
  const { protein, vegetables, primaryTool } = options;
  const cookingTool = canonicalTool(primaryTool);
  const mainVegetable = vegetables[0];
  const titles: Record<string, string> = {
    Sartén: `${protein} con ${mainVegetable} a la sartén`,
    "Olla rápida": `${protein} con ${mainVegetable} en olla rápida`,
    Thermomix: `${protein} con ${mainVegetable} en Thermomix`,
    Airfryer: `${protein} con ${mainVegetable} en airfryer`,
    Horno: `${protein} con ${mainVegetable} al horno`,
    Microondas: `${protein} con ${mainVegetable} al microondas`,
    Otro: `${protein} con ${mainVegetable}`,
  };
  return sentenceCase(titles[cookingTool] ?? titles.Otro);
}

function repairStoredRecipeTitle(recipe: Recipe) {
  const malformedFallbackTitle = /\b(salteado|guiso suave|cremoso|dorado|asado|papillote expres)\b/.test(normalize(recipe.title));
  if (recipe.source !== "fallback" && !malformedFallbackTitle) return sentenceCase(recipe.title);
  const protein = recipe.ingredients[0]?.name;
  const vegetables = recipe.ingredients.filter((ingredient) => ingredient.category === "Frutas y verduras").map((ingredient) => ingredient.name);
  if (!protein || vegetables.length < 2) return sentenceCase(recipe.title);
  const sideIngredient = recipe.mode === "Familiar"
    ? recipe.ingredients.find((ingredient) => ingredient.category === "Legumbres, arroz y pasta")
    : undefined;
  return buildRecipeTitle({
    protein,
    vegetables,
    family: recipe.mode === "Familiar",
    side: { name: sideIngredient?.name ?? vegetables[1] },
    primaryTool: recipe.tools[0] ?? "Otro",
  });
}

function proteinCookingTime(name: string, tool: string) {
  const cookingTool = canonicalTool(tool);
  if (name === "huevos") return cookingTool === "Microondas" ? "2 o 3 minutos" : "3 o 4 minutos";
  if (name === "garbanzos cocidos") return cookingTool === "Olla rápida" ? "2 minutos desde que alcance presión" : "4 o 5 minutos";
  if (name === "salmón" || name === "merluza") return cookingTool === "Horno" ? "10 o 12 minutos" : cookingTool === "Airfryer" ? "8 o 10 minutos" : "3 o 4 minutos por cada lado";
  if (cookingTool === "Horno") return "18 o 22 minutos";
  if (cookingTool === "Airfryer") return "12 o 15 minutos";
  if (cookingTool === "Microondas") return "6 u 8 minutos";
  return "8 o 10 minutos";
}

function buildCookingSteps(options: {
  primaryTool: string;
  protein: string;
  vegetables: string[];
  family: boolean;
  side: { name: string; unit: string; perAdult: number; perChild: number };
  sideAmount: number;
  servings: number;
  avoidAvocado: boolean;
}) {
  const { primaryTool, protein, vegetables, family, side, sideAmount, servings, avoidAvocado } = options;
  const cookingTool = canonicalTool(primaryTool);
  const [firstVegetable, secondVegetable] = vegetables;
  const seasoning = "Añade una cucharada de aceite, una pizca de sal y la especia indicada en los ingredientes";
  const finish = family
    ? `Prueba y ajusta el punto de sal. Reparte la preparación y ${side.name} entre ${servings} platos, sirviendo una ración menor a los niños.`
    : `Prueba y ajusta el punto de sal. Reparte en ${servings} platos y acompaña con ${avoidAvocado ? "las aceitunas" : "el aguacate recién cortado"}.`;

  const common = [
    `${vegetablePreparation(firstVegetable)} ${vegetablePreparation(secondVegetable)}`,
    proteinPreparation(protein),
    ...(family ? [familySidePreparation(side.name)] : []),
  ];

  if (cookingTool === "Sartén") {
    const sidePrep = family && side.name === "patata"
      ? `Calienta una sartén amplia a fuego medio con una cucharada de aceite, añade la patata, tapa y cocínala 8 minutos, removiendo dos veces.`
      : `Calienta una sartén amplia a fuego medio-alto con una cucharada de aceite.`;
    const vegetableStep = `${sidePrep} Añade ${firstVegetable} y ${secondVegetable}; cocínalos durante 6 o 7 minutos, removiendo, hasta que empiecen a estar tiernos.`;
    const proteinStep = protein === "huevos"
      ? "Baja el fuego, vierte los huevos batidos sobre las verduras y remueve suavemente durante 3 o 4 minutos, hasta que estén cuajados pero jugosos."
      : protein === "garbanzos cocidos"
        ? `Añade los garbanzos escurridos. ${seasoning} y saltea todo 4 o 5 minutos, hasta que los garbanzos estén calientes y ligeramente dorados.`
        : `Aparta las verduras hacia los bordes, coloca ${protein} en el centro y cocínalo ${proteinCookingTime(protein, primaryTool)}. Mézclalo después con las verduras durante un minuto.`;
    return [...common, vegetableStep, proteinStep, family && side.name === "pan integral" ? "Sirve el pan integral junto al plato; no es necesario cocinarlo." : finish, ...(family && side.name === "pan integral" ? [finish] : [])];
  }

  if (cookingTool === "Horno") {
    const trayContents = family && side.name === "patata" ? `la patata cortada en dados, ${firstVegetable} y ${secondVegetable}` : `${firstVegetable} y ${secondVegetable}`;
    return [
      ...common,
      `Precalienta el horno a 200 °C. Reparte ${trayContents} en una bandeja sin amontonarlos. ${seasoning} y hornea 12 minutos.`,
      `Saca la bandeja con cuidado, remueve las verduras y coloca ${protein} encima. Hornea ${proteinCookingTime(protein, primaryTool)} más, hasta que esté completamente cocinado en el centro.`,
      "Apaga el horno y deja reposar la bandeja 3 minutos antes de servir.",
      finish,
    ];
  }

  if (cookingTool === "Airfryer") {
    const basketContents = family && side.name === "patata" ? `la patata en dados, ${firstVegetable} y ${secondVegetable}` : `${firstVegetable} y ${secondVegetable}`;
    return [
      ...common,
      `Precalienta la airfryer a 190 °C durante 3 minutos. Mezcla ${basketContents} con una cucharada de aceite, sal y la especia, y cocínalos 8 minutos. Agita la cesta a mitad de tiempo.`,
      `Abre la cesta, incorpora ${protein} en una sola capa y cocina ${proteinCookingTime(protein, primaryTool)} más. Da la vuelta a las piezas a mitad de cocción.`,
      "Comprueba que el alimento principal esté completamente cocinado y deja reposar 2 minutos fuera de la cesta.",
      finish,
    ];
  }

  if (cookingTool === "Olla rápida") {
    const liquidAmount = family && side.name === "arroz integral" ? Math.round(sideAmount * 2.2) : 150;
    return [
      ...common,
      `Con la olla abierta, calienta una cucharada de aceite y rehoga ${protein} durante 3 minutos. Añade ${firstVegetable} y ${secondVegetable} y remueve otros 3 minutos.`,
      family && side.name === "arroz integral"
        ? `Incorpora ${sideAmount} g de arroz integral y ${liquidAmount} ml de agua. Remueve, cierra la olla y cocina 8 minutos desde que alcance presión.`
        : `Añade ${liquidAmount} ml de agua, cierra la olla y cocina ${proteinCookingTime(protein, primaryTool)} desde que alcance presión.`,
      "Retira la olla del fuego, deja que pierda presión siguiendo las instrucciones del fabricante y ábrela únicamente cuando sea seguro.",
      finish,
    ];
  }

  if (cookingTool === "Thermomix") {
    const liquidAmount = family && side.name === "arroz integral" ? Math.round(sideAmount * 2.2) : 100;
    return [
      ...common,
      `Pon ${firstVegetable} y ${secondVegetable} en el vaso. Trocea 4 segundos a velocidad 4. Baja los restos, añade una cucharada de aceite y cocina 8 minutos a 120 °C, giro inverso y velocidad cuchara.`,
      family && side.name === "arroz integral"
        ? `Añade ${protein}, ${sideAmount} g de arroz integral y ${liquidAmount} ml de agua. Cocina 16 minutos a 100 °C, giro inverso y velocidad cuchara.`
        : `Añade ${protein} y ${liquidAmount} ml de agua. Cocina 10 minutos a 100 °C, giro inverso y velocidad cuchara.`,
      "Comprueba el punto de cocción. Si fuera necesario, programa 2 minutos más con la misma temperatura y velocidad.",
      finish,
    ];
  }

  if (cookingTool === "Microondas") {
    const potatoText = family && side.name === "patata" ? "la patata en dados, " : "";
    const proteinStep = protein === "huevos"
      ? "Añade los huevos batidos, mezcla y cocina 2 minutos a 800 W. Remueve y continúa en intervalos de 30 segundos hasta que estén cuajados."
      : `Añade ${protein}, mezcla y cocina ${proteinCookingTime(protein, primaryTool)} a 800 W. Detén la cocción a mitad de tiempo para remover o dar la vuelta a las piezas.`;
    return [
      ...common,
      `Pon ${potatoText}${firstVegetable} y ${secondVegetable} en un recipiente apto para microondas. Añade una cucharada de agua y otra de aceite, tapa sin cerrar herméticamente y cocina 6 minutos a 800 W.`,
      proteinStep,
      "Deja reposar el recipiente tapado durante 2 minutos. Ábrelo con cuidado para evitar el vapor y comprueba la cocción.",
      finish,
    ];
  }

  return [
    ...common,
    `Prepara ${primaryTool} siguiendo las instrucciones de seguridad del fabricante. Cocina primero ${firstVegetable} y ${secondVegetable} con una cucharada de aceite hasta que estén tiernos.`,
    `Incorpora ${protein} y continúa la cocción hasta que esté completamente hecho en el centro. Remueve o da la vuelta cuando sea necesario.`,
    finish,
  ];
}

function upgradeRecipeSteps(recipe: Recipe): Recipe {
  const title = repairStoredRecipeTitle(recipe);
  if (recipe.stepsVersion === 2) return { ...recipe, title };
  const protein = recipe.ingredients[0]?.name;
  const vegetables = recipe.ingredients.slice(1, 3).map((ingredient) => ingredient.name);
  if (!protein || vegetables.length < 2) return recipe;
  const sideIngredient = recipe.mode === "Familiar" ? recipe.ingredients[3] : undefined;
  const side = {
    name: sideIngredient?.name ?? "patata",
    unit: sideIngredient?.unit ?? "g",
    perAdult: 0,
    perChild: 0,
  };
  const primaryTool = recipe.tools[0] ?? "Sartén";
  return {
    ...recipe,
    title,
    tools: [primaryTool],
    stepsVersion: 2,
    steps: buildCookingSteps({
      primaryTool,
      protein,
      vegetables,
      family: recipe.mode === "Familiar",
      side,
      sideAmount: sideIngredient?.amount ?? 0,
      servings: recipe.servings,
      avoidAvocado: !recipe.ingredients.some((ingredient) => ingredient.name === "aguacate"),
    }),
  };
}

function makeRecipe(kind: RecipeKind, index: number, config: Config, nonce = 0): Recipe {
  const seed = index + nonce * 3 + (kind === "Cena" ? 7 : 0);
  const family = config.children > 0;
  const restrictions = `${config.allergies},${config.avoid}`;
  const selectedTools = [...config.tools, ...(config.otherTool.trim() ? [config.otherTool.trim()] : [])];
  const primaryTool = selectedTools[seed % selectedTools.length] || "Utensilios básicos";
  const usedTools = [primaryTool];
  const protein = pickProtein(seed, restrictions, primaryTool);
  const vegetables = pickVegetables(seed, restrictions);
  const totalMinutes = config.timeBand === "quick" ? 22 + (seed % 9) : config.timeBand === "medium" ? 38 + (seed % 20) : 72 + (seed % 41);
  const activeMinutes = Math.min(totalMinutes, config.timeBand === "quick" ? 14 + (seed % 9) : 20 + (seed % 16));
  const servings = config.adults + config.children;
  const proteinAmount = protein.name === "huevos" ? servings * 2 : config.adults * 180 + config.children * 100;
  const proteinUnit = protein.name === "huevos" ? "ud." : "g";
  const vegAmount = config.adults * 160 + config.children * 100;
  const side = pickFamilySide(seed, restrictions, primaryTool);
  const sideAmount = side.perAdult * config.adults + side.perChild * config.children;
  const avoidAvocado = ingredientIsRestricted("aguacate", "Frutas y verduras", restrictions);
  const ingredients: Ingredient[] = [
    { name: protein.name, amount: proteinAmount, unit: proteinUnit, category: protein.category },
    { name: vegetables[0], amount: vegAmount, unit: "g", category: "Frutas y verduras" },
    { name: vegetables[1], amount: Math.round(vegAmount * 0.7), unit: "g", category: "Frutas y verduras" },
    ...(family ? [{ name: side.name, amount: sideAmount, unit: side.unit, category: "Legumbres, arroz y pasta" }] : [avoidAvocado ? { name: "aceitunas verdes", amount: servings * 80, unit: "g", category: "Otros" } : { name: "aguacate", amount: servings, unit: "ud.", category: "Frutas y verduras" }]),
    { name: "aceite de oliva virgen extra", amount: 2, unit: "cucharadas", category: "Otros", staple: true },
    { name: "sal", amount: 1, unit: "pizca", category: "Otros", staple: true },
    { name: seed % 2 ? "pimentón dulce" : "orégano", amount: 1, unit: "cucharadita", category: "Otros", staple: true },
    ...(family && side.name === "arroz integral" ? [{ name: "agua", amount: Math.round(sideAmount * 2.2), unit: "ml", category: "Otros", staple: true }] : []),
  ];
  const title = buildRecipeTitle({ protein: protein.name, vegetables, family, side, primaryTool });
  const steps = buildCookingSteps({ primaryTool, protein: protein.name, vegetables, family, side, sideAmount, servings, avoidAvocado });
  return {
    id: `recipe-${Date.now()}-${kind}-${index}-${nonce}`, title, emoji: protein.emoji, kind,
    mode: family ? "Familiar" : "Low carb", activeMinutes, totalMinutes, servings,
    difficulty: usedTools.length > 1 ? "Fácil" : "Muy fácil", tools: usedTools,
    calories: family ? 430 + (seed % 5) * 24 : 360 + (seed % 5) * 21,
    protein: 27 + (seed % 5) * 4, carbs: family ? 34 + (seed % 5) * 7 : 9 + (seed % 5) * 3,
    ingredients, steps, stepsVersion: 2,
    childNote: family ? `Sirve a los niños una ración menor de ${protein.name}, una porción completa de ${side.name} y ofrece la verdura sin mezclar si la prefieren así.` : undefined,
    source: "fallback",
  };
}

function generateRecipes(config: Config, nonce = 0, avoidRecipes: Recipe[] = []) {
  const restrictions = `${config.allergies},${config.avoid}`;
  const selected: Recipe[] = [];
  const titles = new Set<string>();
  const references = avoidRecipes.map(recipeSummary);
  const addCompatibleRecipes = (kind: RecipeKind, count: number, offset: number) => {
    for (let attempt = 0; attempt < 120 && selected.filter((recipe) => recipe.kind === kind).length < count; attempt += 1) {
      const candidate = makeRecipe(kind, attempt, config, nonce + offset);
      const violatesRestriction = candidate.ingredients.some((ingredient) => ingredientIsRestricted(ingredient.name, ingredient.category, restrictions));
      const candidateTitleKey = titleKey(candidate.title);
      const summary = recipeSummary(candidate);
      if (violatesRestriction || titles.has(candidateTitleKey) || references.some((reference) => recipesAreDuplicate(summary, reference))) continue;
      selected.push(candidate);
      titles.add(candidateTitleKey);
      references.push(summary);
    }
  };
  addCompatibleRecipes("Comida", config.lunches, 0);
  addCompatibleRecipes("Cena", config.dinners, 2);
  return selected;
}

async function requestRecipes(
  config: Config,
  options: { favorites?: Recipe[]; avoidRecipes?: Recipe[]; avoidTitles?: string[] } = {},
) {
  const response = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config,
      favoriteRecipes: (options.favorites ?? []).map(recipeSummary),
      avoidRecipes: (options.avoidRecipes ?? []).map(recipeSummary),
      avoidTitles: options.avoidTitles ?? [],
    }),
  });
  const payload = await response.json() as { recipes?: Recipe[]; error?: string; code?: string };
  if (!response.ok) throw new RecipeGenerationError(payload.error ?? "La generación con IA no está disponible.", payload.code);
  if (!Array.isArray(payload.recipes) || payload.recipes.length !== config.lunches + config.dinners) {
    throw new Error("AI generation returned an invalid recipe count");
  }
  return payload.recipes;
}

function buildShoppingList(recipes: Recipe[], previous: ShoppingItem[] = []): ShoppingItem[] {
  const checked = new Map(previous.map((item) => [`${item.name}-${item.unit}`, item.checked]));
  const grouped = new Map<string, ShoppingItem>();
  recipes.forEach((recipe) => recipe.ingredients.filter((ingredient) => !ingredient.staple).forEach((ingredient) => {
    const key = `${ingredient.name}-${ingredient.unit}`;
    const current = grouped.get(key);
    grouped.set(key, { ...ingredient, amount: (current?.amount ?? 0) + ingredient.amount, checked: checked.get(key) ?? false });
  }));
  return [...grouped.values()].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
}

function level(value: number, kind: "protein" | "carbs") {
  const limits = kind === "protein" ? [18, 30] : [20, 40];
  return value < limits[0] ? "Bajo" : value < limits[1] ? "Medio" : "Alto";
}

function MetricBar({ label, value, kind }: { label: string; value: number; kind: "protein" | "carbs" }) {
  const rating = level(value, kind);
  const width = rating === "Bajo" ? 33 : rating === "Medio" ? 66 : 100;
  return <div className="metric"><div className="metric-label"><span>{label}</span><strong>{rating} · {value} g</strong></div><div className="metric-track"><span style={{ width: `${width}%` }} /></div></div>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("inicio");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [favorites, setFavorites] = useState<Recipe[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [cookStep, setCookStep] = useState<number | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");
  const [generationWarning, setGenerationWarning] = useState("");
  const [aiFailure, setAiFailure] = useState<{ action: "menu" } | { action: "replace"; recipeId: string } | null>(null);
  const [replaceNonce, setReplaceNonce] = useState(1);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedFavorites = localStorage.getItem("nutricionapp-favorites");
        const savedRecipes = localStorage.getItem("nutricionapp-recipes");
        const savedConfig = localStorage.getItem("nutricionapp-config");
        if (savedFavorites) setFavorites((JSON.parse(savedFavorites) as Recipe[]).map(upgradeRecipeSteps));
        if (savedConfig) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) });
        if (savedRecipes) {
          const parsed = (JSON.parse(savedRecipes) as Recipe[]).map(upgradeRecipeSteps);
          setRecipes(parsed);
          setShopping(buildShoppingList(parsed));
        }
      } catch { /* A damaged local draft should never prevent the app from opening. */ }
      setHydrated(true);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem("nutricionapp-favorites", JSON.stringify(favorites)); }, [favorites, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("nutricionapp-recipes", JSON.stringify(recipes)); }, [recipes, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("nutricionapp-config", JSON.stringify(config)); }, [config, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(timer); }, [toast]);

  const groupedShopping = useMemo(() => CATEGORIES.map((category) => ({ category, items: shopping.filter((item) => item.category === category) })).filter((group) => group.items.length), [shopping]);
  const startGeneration = () => { if (recipes.length || shopping.length) setConfirmNew(true); else { setStep(1); setWizardOpen(true); } };
  const openWizardAfterConfirm = () => { setConfirmNew(false); setStep(1); setWizardOpen(true); };
  const finishGeneration = async () => {
    if (config.lunches + config.dinners === 0 || config.tools.length + Number(Boolean(config.otherTool.trim())) === 0) return;
    setGenerating(true);
    try {
      const nextRecipes = await requestRecipes(config, { favorites });
      if (nextRecipes.length < config.lunches + config.dinners) {
        setToast("No hay suficientes combinaciones compatibles. Reduce las restricciones o el número de recetas.");
        return;
      }
      setRecipes(nextRecipes); setShopping(buildShoppingList(nextRecipes)); setReplaceNonce((value) => value + 1);
      setWizardOpen(false); setSection("recetas");
      setToast("Tu nuevo menú con IA está listo");
    } catch (error) {
      if (error instanceof RecipeGenerationError && error.code === "NO_DISTINCT_ALTERNATIVE") {
        setGenerationWarning(error.message);
        return;
      }
      setAiFailure({ action: "menu" });
    } finally {
      setGenerating(false);
    }
  };
  const chooseBasicMenu = () => {
    const nextRecipes = generateRecipes(config, replaceNonce, favorites);
    if (nextRecipes.length < config.lunches + config.dinners) {
      setGenerationWarning("El generador básico tampoco encuentra una combinación suficientemente distinta. Amplía el tiempo, los utensilios o los alimentos permitidos.");
      return;
    }
    setAiFailure(null);
    setRecipes(nextRecipes); setShopping(buildShoppingList(nextRecipes)); setReplaceNonce((value) => value + 1);
    setWizardOpen(false); setSection("recetas");
    setToast("Menú creado con el generador básico");
  };
  const toggleFavorite = (recipe: Recipe) => {
    const exists = favorites.some((favorite) => favorite.id === recipe.id);
    setFavorites(exists ? favorites.filter((favorite) => favorite.id !== recipe.id) : [...favorites, recipe]);
    setToast(exists ? "Eliminada de favoritas" : "Guardada en favoritas");
  };
  const replaceRecipe = async (recipe: Recipe) => {
    const replacementConfig: Config = {
      ...config,
      lunches: recipe.kind === "Comida" ? 1 : 0,
      dinners: recipe.kind === "Cena" ? 1 : 0,
    };
    let replacement: Recipe | undefined;
    try {
      [replacement] = await requestRecipes(replacementConfig, { favorites, avoidRecipes: recipes });
    } catch (error) {
      if (error instanceof RecipeGenerationError && error.code === "NO_DISTINCT_ALTERNATIVE") {
        setGenerationWarning(error.message);
        return;
      }
      setAiFailure({ action: "replace", recipeId: recipe.id });
      return;
    }
    if (!replacement) {
      setGenerationWarning("No se ha encontrado otra receta suficientemente distinta con estas preferencias. Amplía el tiempo, los utensilios o los alimentos permitidos.");
      return;
    }
    const next = recipes.map((item) => item.id === recipe.id ? replacement : item);
    setRecipes(next); setShopping(buildShoppingList(next)); setReplaceNonce((value) => value + 1);
    setSelectedRecipe(replacement);
    setToast("Receta sustituida con IA y compra actualizada");
  };
  const chooseBasicReplacement = (recipe: Recipe) => {
    const index = recipes.filter((item) => item.kind === recipe.kind).findIndex((item) => item.id === recipe.id);
    const restrictions = `${config.allergies},${config.avoid}`;
    const otherRecipes = [...favorites, ...recipes.filter((item) => item.id !== recipe.id), recipe];
    const otherTitles = new Set(otherRecipes.map((item) => titleKey(item.title)));
    const references = otherRecipes.map(recipeSummary);
    let replacement: Recipe | undefined;
    for (let attempt = 0; attempt < 120 && !replacement; attempt += 1) {
      const candidate = makeRecipe(recipe.kind, Math.max(index, 0) + attempt + 1, config, replaceNonce + 4);
      const violatesRestriction = candidate.ingredients.some((ingredient) => ingredientIsRestricted(ingredient.name, ingredient.category, restrictions));
      if (!violatesRestriction
        && !otherTitles.has(titleKey(candidate.title))
        && !references.some((reference) => recipesAreDuplicate(recipeSummary(candidate), reference))) replacement = candidate;
    }
    if (!replacement) {
      setGenerationWarning("El generador básico no encuentra otra receta suficientemente distinta con estas preferencias. Amplía el tiempo, los utensilios o los alimentos permitidos.");
      return;
    }
    setAiFailure(null);
    const next = recipes.map((item) => item.id === recipe.id ? replacement : item);
    setRecipes(next); setShopping(buildShoppingList(next)); setReplaceNonce((value) => value + 1);
    setSelectedRecipe(replacement);
    setToast("Receta creada con el generador básico");
  };
  const retryAiGeneration = () => {
    const failedAction = aiFailure;
    setAiFailure(null);
    if (failedAction?.action === "menu") void finishGeneration();
    if (failedAction?.action === "replace") {
      const recipe = recipes.find((item) => item.id === failedAction.recipeId);
      if (recipe) void replaceRecipe(recipe);
    }
  };
  const chooseBasicGenerator = () => {
    if (aiFailure?.action === "menu") chooseBasicMenu();
    if (aiFailure?.action === "replace") {
      const recipe = recipes.find((item) => item.id === aiFailure.recipeId);
      if (recipe) chooseBasicReplacement(recipe);
    }
  };
  const shoppingText = () => groupedShopping.map((group) => [group.category.toUpperCase(), ...group.items.map((item) => `${item.checked ? "✓" : "☐"} ${item.amount} ${item.unit} de ${item.name}`)].join("\n")).join("\n\n");
  const copyShopping = async () => { await navigator.clipboard.writeText(shoppingText()); setToast("Lista copiada"); };
  const shareShopping = async () => { if (navigator.share) await navigator.share({ title: "Lista de la compra · NUTRICIONAPP", text: shoppingText() }); else await copyShopping(); };
  const navItems: { key: Section; icon: string; label: string }[] = [
    { key: "inicio", icon: "⌂", label: "Inicio" }, { key: "recetas", icon: "▤", label: "Recetas" },
    { key: "compra", icon: "✓", label: "Compra" }, { key: "favoritas", icon: "♡", label: "Favoritas" },
  ];

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setSection("inicio")} aria-label="Ir al inicio"><span className="brand-mark">N</span><span><strong>NUTRICION</strong>APP<small>Come rico. Vive ligero.</small></span></button><span className="beta-pill">Versión de prueba</span></header>
    <div className="content">
      {section === "inicio" && <section className="home-view">
        <div className="hero-card"><div className="hero-copy"><span className="eyebrow">TU MENÚ, A TU MANERA</span><h1>Recetas sencillas para comer mejor.</h1><p>Elige tus necesidades y prepara en minutos un menú equilibrado con su lista de la compra.</p><button className="primary-button light" onClick={startGeneration}>Generar recetas <span>→</span></button></div><div className="hero-plate" aria-hidden="true"><span>🥬</span><span>🍅</span><span>🥑</span><span>🍗</span></div></div>
        {recipes.length > 0 ? <div className="current-plan"><div><span className="eyebrow dark">TU SELECCIÓN ACTUAL</span><h2>{recipes.length} recetas listas para cocinar</h2><p>{recipes.filter((recipe) => recipe.kind === "Comida").length} comidas · {recipes.filter((recipe) => recipe.kind === "Cena").length} cenas · {recipes[0]?.servings} raciones</p></div><button className="outline-button" onClick={() => setSection("recetas")}>Ver recetas</button></div> : <div className="empty-welcome"><span>🥣</span><div><strong>Aún no tienes recetas</strong><p>Genera tu primera selección y aparecerá aquí.</p></div></div>}
        <div className="feature-grid"><button onClick={() => setSection("recetas")}><span>🍲</span><strong>Recetas claras</strong><small>Ingredientes y pasos sencillos</small></button><button onClick={() => setSection("compra")}><span>🧺</span><strong>Compra ordenada</strong><small>Todo agrupado por secciones</small></button><button onClick={() => setSection("favoritas")}><span>♥</span><strong>Tus favoritas</strong><small>Siempre a mano en este móvil</small></button></div>
      </section>}
      {section === "recetas" && <section className="section-view"><div className="section-heading"><div><span className="eyebrow dark">TU SELECCIÓN</span><h1>Recetas generadas</h1><p>Guarda tus preferidas o cambia una receta sin empezar de nuevo.</p></div><button className="primary-button compact" onClick={startGeneration}>+ Generar nuevas</button></div>{recipes.length ? <div className="recipe-grid">{recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} favorite={favorites.some((favorite) => favorite.id === recipe.id)} onOpen={() => setSelectedRecipe(recipe)} onFavorite={() => toggleFavorite(recipe)} />)}</div> : <EmptyState icon="🍽️" title="No hay recetas todavía" text="Genera una selección para comenzar." action={startGeneration} />}</section>}
      {section === "compra" && <section className="section-view shopping-view"><div className="section-heading"><div><span className="eyebrow dark">TODO LO NECESARIO</span><h1>Lista de la compra</h1><p>Los básicos de despensa y las especias comunes no están incluidos.</p></div></div>{shopping.length ? <><div className="shopping-actions no-print"><button onClick={copyShopping}>▣ Copiar</button><button onClick={shareShopping}>↗ Compartir</button><button onClick={() => window.print()}>⇩ Descargar PDF</button></div><div className="shopping-paper"><div className="print-header"><span className="brand-mark small">N</span><div><strong>NUTRICIONAPP</strong><small>Mi lista de la compra</small></div></div>{groupedShopping.map((group) => <div className="shopping-group" key={group.category}><h2>{group.category}</h2>{group.items.map((item) => <label key={`${item.name}-${item.unit}`}><input type="checkbox" checked={item.checked} onChange={() => setShopping(shopping.map((current) => current.name === item.name && current.unit === item.unit ? { ...current, checked: !current.checked } : current))} /><span className="checkmark"/><span>{item.name}</span><strong>{item.amount} {item.unit}</strong></label>)}</div>)}<div className="shopping-note">Hecho con cariño para comer mejor cada día.</div></div></> : <EmptyState icon="🧺" title="Tu lista está vacía" text="Se creará automáticamente al generar recetas." action={startGeneration} />}</section>}
      {section === "favoritas" && <section className="section-view"><div className="section-heading"><div><span className="eyebrow dark">TU RECETARIO</span><h1>Recetas favoritas</h1><p>Se guardan en este dispositivo aunque generes un nuevo menú.</p></div></div>{favorites.length ? <div className="recipe-grid">{favorites.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} favorite onOpen={() => setSelectedRecipe(recipe)} onFavorite={() => toggleFavorite(recipe)} />)}</div> : <EmptyState icon="♡" title="Todavía no tienes favoritas" text="Pulsa el corazón de una receta para conservarla." action={() => setSection("recetas")} actionLabel="Ver recetas" />}</section>}
    </div>
    <nav className="bottom-nav" aria-label="Navegación principal">{navItems.map((item) => <button key={item.key} className={section === item.key ? "active" : ""} onClick={() => setSection(item.key)}><span>{item.icon}</span>{item.label}{item.key === "favoritas" && favorites.length > 0 && <i>{favorites.length}</i>}</button>)}</nav>
    {wizardOpen && <Wizard step={step} setStep={setStep} config={config} setConfig={setConfig} onClose={() => setWizardOpen(false)} onFinish={finishGeneration} generating={generating} />}
    {confirmNew && <ConfirmModal onCancel={() => setConfirmNew(false)} onConfirm={openWizardAfterConfirm} />}
    {generationWarning && <ConstraintWarningModal message={generationWarning} onClose={() => setGenerationWarning("")} />}
    {aiFailure && <AiFailureModal hasExistingRecipes={recipes.length > 0} onCancel={() => setAiFailure(null)} onRetry={retryAiGeneration} onUseBasic={chooseBasicGenerator} />}
    {selectedRecipe && <RecipeDetail recipe={selectedRecipe} favorite={favorites.some((favorite) => favorite.id === selectedRecipe.id)} cookStep={cookStep} setCookStep={setCookStep} onClose={() => { setSelectedRecipe(null); setCookStep(null); }} onFavorite={() => toggleFavorite(selectedRecipe)} onReplace={() => replaceRecipe(selectedRecipe)} canReplace={recipes.some((recipe) => recipe.id === selectedRecipe.id)} />}
    {toast && <div className="toast" role="status">✓ {toast}</div>}
  </main>;
}

function RecipeCard({ recipe, favorite, onOpen, onFavorite }: { recipe: Recipe; favorite: boolean; onOpen: () => void; onFavorite: () => void }) {
  return <article className="recipe-card"><div className={`recipe-cover ${recipe.mode === "Familiar" ? "family" : "lowcarb"}`}><span className="meal-label">{recipe.kind}</span><button className={favorite ? "favorite active" : "favorite"} onClick={onFavorite} aria-label={favorite ? "Quitar de favoritas" : "Añadir a favoritas"}>{favorite ? "♥" : "♡"}</button><div className="food-emoji">{recipe.emoji}</div></div><div className="recipe-body"><div className="recipe-tags"><span>{recipe.mode}</span><span>{recipe.difficulty}</span></div><h2>{recipe.title}</h2><div className="recipe-meta"><span>◷ {recipe.totalMinutes} min</span><span>♙ {recipe.servings} raciones</span><span>⚡ {recipe.calories} kcal</span></div><button onClick={onOpen}>Ver receta <span>→</span></button></div></article>;
}

function EmptyState({ icon, title, text, action, actionLabel = "Generar recetas" }: { icon: string; title: string; text: string; action: () => void; actionLabel?: string }) {
  return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button className="primary-button compact" onClick={action}>{actionLabel}</button></div>;
}

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop"><div className="confirm-card"><button className="close-button" onClick={onCancel}>×</button><div className="confirm-icon">↻</div><h2>¿Quieres generar nuevas recetas?</h2><p>Las recetas actuales que no hayas guardado como favoritas y la lista de la compra serán sustituidas.</p><div className="safe-note">♥ Tus recetas favoritas se conservarán</div><div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button compact" onClick={onConfirm}>Continuar y generar</button></div></div></div>;
}

function ConstraintWarningModal({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="constraint-warning-title"><div className="confirm-card ai-failure-card"><button className="close-button" onClick={onClose} aria-label="Cerrar">×</button><div className="confirm-icon">≠</div><h2 id="constraint-warning-title">No hay una alternativa realmente distinta</h2><p>{message}</p><div className="safe-note">Tus recetas actuales y tus favoritas siguen sin cambios.</div><div className="modal-actions"><button className="primary-button compact" onClick={onClose}>Revisar preferencias</button></div></div></div>;
}

function AiFailureModal({ hasExistingRecipes, onCancel, onRetry, onUseBasic }: { hasExistingRecipes: boolean; onCancel: () => void; onRetry: () => void; onUseBasic: () => void }) {
  return <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="ai-failure-title"><div className="confirm-card ai-failure-card"><button className="close-button" onClick={onCancel} aria-label="Cerrar">×</button><div className="confirm-icon">!</div><h2 id="ai-failure-title">No hemos podido conectar con la IA</h2><p>{hasExistingRecipes ? "Tus recetas actuales y tu lista de la compra se conservan sin cambios." : "No se ha cambiado ninguna receta."} Puedes volver a intentarlo ahora.</p><div className="safe-note">No se ha activado ningún generador de respaldo automáticamente.</div><div className="failure-actions"><button className="primary-button compact" onClick={onRetry}>Reintentar</button><button className="outline-button" onClick={onUseBasic}>Usar generador básico</button><button className="secondary-button" onClick={onCancel}>Volver sin cambios</button></div><small className="basic-generator-note">El generador básico es opcional y crea recetas locales más sencillas.</small></div></div>;
}

function Wizard({ step, setStep, config, setConfig, onClose, onFinish, generating }: { step: number; setStep: (step: number) => void; config: Config; setConfig: (config: Config) => void; onClose: () => void; onFinish: () => void; generating: boolean }) {
  const totalRecipes = config.lunches + config.dinners;
  const canContinue = step !== 2 || totalRecipes > 0;
  const canFinish = config.tools.length + Number(Boolean(config.otherTool.trim())) > 0;
  const toggleTool = (tool: string) => setConfig({ ...config, tools: config.tools.includes(tool) ? config.tools.filter((item) => item !== tool) : [...config.tools, tool] });
  return <div className="wizard-screen"><header><button className="back-button" onClick={step === 1 ? onClose : () => setStep(step - 1)}>←</button><div><strong>Generar recetas</strong><small>Paso {step} de 5</small></div><button className="close-button" onClick={onClose}>×</button></header><div className="progress"><span style={{ width: `${step * 20}%` }} /></div><div className="wizard-content">
    {generating ? <div className="generating"><div className="spinner">🥗</div><h1>Preparando tus recetas…</h1><p>Estamos combinando opciones sencillas y equilibradas.</p><div className="generation-steps"><span className="done">✓ Preferencias revisadas</span><span className="done">✓ Recetas seleccionadas</span><span>○ Creando la lista de la compra</span></div></div> : <>
      {step === 1 && <div className="wizard-step"><span className="step-emoji">👨‍👩‍👧</span><h1>¿Para cuántas personas?</h1><p>Adaptaremos las cantidades y el tipo de receta.</p><FieldLabel text="Adultos" required/><div className="choice-grid two"><Choice active={config.adults === 1} onClick={() => setConfig({ ...config, adults: 1 })} title="1 adulto"/><Choice active={config.adults === 2} onClick={() => setConfig({ ...config, adults: 2 })} title="2 adultos"/></div><FieldLabel text="Niños" hint="Referencia nutricional: 6 a 10 años"/><div className="choice-grid three"><Choice active={config.children === 0} onClick={() => setConfig({ ...config, children: 0 })} title="Ninguno"/><Choice active={config.children === 1} onClick={() => setConfig({ ...config, children: 1 })} title="1 niño"/><Choice active={config.children === 2} onClick={() => setConfig({ ...config, children: 2 })} title="2 niños"/></div><div className="info-note">{config.children ? "Generaremos recetas familiares sanas y equilibradas." : "Generaremos recetas low carb para adultos."}</div></div>}
      {step === 2 && <div className="wizard-step"><span className="step-emoji">🍽️</span><h1>¿Cuántas recetas necesitas?</h1><p>Elige de 0 a 5. No asignaremos días a las recetas.</p><Counter label="Comidas" value={config.lunches} onChange={(lunches) => setConfig({ ...config, lunches })}/><Counter label="Cenas" value={config.dinners} onChange={(dinners) => setConfig({ ...config, dinners })}/>{totalRecipes === 0 ? <div className="error-note">Selecciona al menos una comida o cena.</div> : <div className="selection-total"><strong>{totalRecipes}</strong><span>recetas en total</span></div>}</div>}
      {step === 3 && <div className="wizard-step"><span className="step-emoji">⏱️</span><h1>¿Cuánto tiempo quieres cocinar?</h1><p>El límite se aplicará al tiempo total de cada receta.</p><div className="time-choices"><TimeChoice active={config.timeBand === "quick"} onClick={() => setConfig({ ...config, timeBand: "quick" })} title="Hasta 30 minutos" detail="Recetas rápidas para el día a día"/><TimeChoice active={config.timeBand === "medium"} onClick={() => setConfig({ ...config, timeBand: "medium" })} title="Entre 30 y 60 minutos" detail="Algo más de elaboración, sin complicarse"/><TimeChoice active={config.timeBand === "slow"} onClick={() => setConfig({ ...config, timeBand: "slow" })} title="Entre 1 y 2 horas" detail="Para cocinar con más calma"/></div><div className="info-note">Cada receta mostrará el tiempo activo y el tiempo total.</div></div>}
      {step === 4 && <div className="wizard-step"><span className="step-emoji">🍳</span><h1>¿Qué tienes en tu cocina?</h1><p>Usaremos como máximo dos utensilios principales por receta.</p><div className="tool-grid">{TOOLS.map((tool) => <Choice key={tool} active={config.tools.includes(tool)} onClick={() => toggleTool(tool)} title={tool} check/>)}</div><FieldLabel text="Otro utensilio"/><input className="text-input" value={config.otherTool} onChange={(event) => setConfig({ ...config, otherTool: event.target.value })} placeholder="Ej. plancha eléctrica"/>{!canFinish && <div className="error-note">Selecciona al menos un utensilio disponible.</div>}</div>}
      {step === 5 && <div className="wizard-step"><span className="step-emoji">🌿</span><h1>Últimos detalles</h1><p>Déjalos vacíos si no tienes ninguna restricción.</p><FieldLabel text="Alergias o intolerancias"/><textarea className="text-input textarea" value={config.allergies} onChange={(event) => setConfig({ ...config, allergies: event.target.value })} placeholder="Ej. lactosa, frutos secos…"/><FieldLabel text="Alimentos a evitar"/><textarea className="text-input textarea" value={config.avoid} onChange={(event) => setConfig({ ...config, avoid: event.target.value })} placeholder="Ej. champiñones, cebolla…"/><div className="summary-card"><strong>Tu selección</strong><span>{config.adults} {config.adults === 1 ? "adulto" : "adultos"}{config.children ? ` · ${config.children} ${config.children === 1 ? "niño" : "niños"}` : ""}</span><span>{config.lunches} comidas · {config.dinners} cenas</span><span>{config.timeBand === "quick" ? "Hasta 30 min" : config.timeBand === "medium" ? "Entre 30 y 60 min" : "Entre 1 y 2 horas"}</span>{config.allergies.trim() && <span>Alergias: {config.allergies.trim()}</span>}{config.avoid.trim() && <span>Evitar: {config.avoid.trim()}</span>}</div><div className="demo-note">Las recetas se generan con IA. Si no podemos conectar, conservaremos tus recetas y podrás reintentar o elegir voluntariamente el generador básico.</div></div>}
    </>}
  </div>{!generating && <footer><span>{step < 5 ? "Puedes cambiarlo más tarde" : `${totalRecipes} recetas listas para generar`}</span>{step < 5 ? <button className="primary-button compact" disabled={!canContinue || (step === 4 && !canFinish)} onClick={() => setStep(step + 1)}>Continuar →</button> : <button className="primary-button compact" disabled={!canFinish} onClick={onFinish}>Generar mis recetas ✦</button>}</footer>}</div>;
}

function FieldLabel({ text, required, hint }: { text: string; required?: boolean; hint?: string }) { return <div className="field-label"><strong>{text}{required && " *"}</strong>{hint && <small>{hint}</small>}</div>; }
function Choice({ active, onClick, title, check }: { active: boolean; onClick: () => void; title: string; check?: boolean }) { return <button className={`choice ${active ? "active" : ""}`} onClick={onClick}>{check && <i>{active ? "✓" : ""}</i>}<strong>{title}</strong></button>; }
function TimeChoice({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) { return <button className={`time-choice ${active ? "active" : ""}`} onClick={onClick}><i>{active ? "✓" : ""}</i><span><strong>{title}</strong><small>{detail}</small></span></button>; }
function Counter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <div className="counter"><div><strong>{label}</strong><small>De 0 a 5 recetas</small></div><div><button disabled={value === 0} onClick={() => onChange(value - 1)}>−</button><span>{value}</span><button disabled={value === 5} onClick={() => onChange(value + 1)}>+</button></div></div>; }

function RecipeDetail({ recipe, favorite, cookStep, setCookStep, onClose, onFavorite, onReplace, canReplace }: { recipe: Recipe; favorite: boolean; cookStep: number | null; setCookStep: (step: number | null) => void; onClose: () => void; onFavorite: () => void; onReplace: () => void; canReplace: boolean }) {
  if (cookStep !== null) return <div className="detail-screen cook-mode"><header><button className="back-button" onClick={() => setCookStep(null)}>←</button><div><strong>Cocinar paso a paso</strong><small>{recipe.title}</small></div><button className="close-button" onClick={onClose}>×</button></header><div className="cook-content"><span className="cook-count">Paso {cookStep + 1} de {recipe.steps.length}</span><div className="cook-emoji">{recipe.emoji}</div><p>{recipe.steps[cookStep]}</p></div><footer><button className="secondary-button" disabled={cookStep === 0} onClick={() => setCookStep(Math.max(0, cookStep - 1))}>← Anterior</button><button className="primary-button compact" onClick={() => cookStep === recipe.steps.length - 1 ? setCookStep(null) : setCookStep(cookStep + 1)}>{cookStep === recipe.steps.length - 1 ? "Terminar ✓" : "Siguiente →"}</button></footer></div>;
  return <div className="detail-screen"><header><button className="back-button" onClick={onClose}>←</button><div><strong>{recipe.kind}</strong><small>{recipe.mode}</small></div><button className={favorite ? "favorite detail-fav active" : "favorite detail-fav"} onClick={onFavorite}>{favorite ? "♥" : "♡"}</button></header><div className={`detail-hero ${recipe.mode === "Familiar" ? "family" : "lowcarb"}`}><span>{recipe.emoji}</span><div><div className="recipe-tags"><em>{recipe.kind}</em><em>{recipe.mode}</em></div><h1>{recipe.title}</h1><p>Una receta sencilla, sabrosa y pensada para tu selección.</p></div></div><div className="detail-content"><div className="stat-row"><div><small>Tiempo activo</small><strong>{recipe.activeMinutes} min</strong></div><div><small>Tiempo total</small><strong>{recipe.totalMinutes} min</strong></div><div><small>Raciones</small><strong>{recipe.servings}</strong></div><div><small>Dificultad</small><strong>{recipe.difficulty}</strong></div></div><section><h2>Información nutricional <small>por ración</small></h2><div className="nutrition-card"><div className="calories"><strong>{recipe.calories}</strong><span>kcal</span></div><div className="metric-list"><MetricBar label="Proteínas" value={recipe.protein} kind="protein"/><MetricBar label="Hidratos" value={recipe.carbs} kind="carbs"/></div></div></section><section><h2>Ingredientes</h2><ul className="ingredient-list">{recipe.ingredients.map((ingredient) => <li key={ingredient.name}><span>{ingredient.name}</span><strong>{ingredient.amount} {ingredient.unit}</strong></li>)}</ul></section>{recipe.childNote && <div className="child-note"><span>👧</span><div><strong>Adaptación infantil</strong><p>{recipe.childNote}</p></div></div>}<section><h2>Preparación</h2><ol className="steps-list">{recipe.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section><div className="detail-actions"><button className="primary-button" onClick={() => setCookStep(0)}>Cocinar paso a paso →</button>{canReplace && <button className="secondary-button" onClick={onReplace}>↻ Cambiar esta receta</button>}</div><p className="nutrition-disclaimer">Valores nutricionales aproximados. Revisa siempre los ingredientes en caso de alergia o intolerancia.</p></div></div>;
}

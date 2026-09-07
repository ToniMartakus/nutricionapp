import assert from "node:assert/strict";
import test from "node:test";

import { createRecipePdf, recipePdfFilename } from "../lib/recipe-pdf.ts";

export const sampleRecipe = {
  title: "Salmón con espinacas al limón",
  kind: "Cena",
  mode: "Low carb",
  activeMinutes: 18,
  totalMinutes: 28,
  servings: 2,
  difficulty: "Muy fácil",
  tools: ["Sartén"],
  calories: 415,
  protein: 34,
  carbs: 9,
  ingredients: [
    { name: "lomos de salmón", amount: 360, unit: "g" },
    { name: "espinacas frescas", amount: 300, unit: "g" },
    { name: "limón", amount: 1, unit: "ud." },
    { name: "aceite de oliva virgen extra", amount: 2, unit: "cucharadas" },
  ],
  steps: [
    "Revisa los lomos de salmón, retira las espinas visibles y sécalos con papel de cocina.",
    "Lava las espinacas, escúrrelas bien y ralla la parte amarilla de la piel del limón.",
    "Calienta una cucharada de aceite en la sartén a fuego medio-alto durante un minuto.",
    "Cocina el salmón cuatro minutos por el primer lado y tres minutos por el segundo.",
    "Retira el salmón, añade las espinacas y saltéalas dos minutos hasta que pierdan volumen.",
    "Sirve el salmón sobre las espinacas y termina con la ralladura y unas gotas de limón.",
  ],
};

test("crea un PDF de receta válido con un nombre seguro", async () => {
  const blob = createRecipePdf(sampleRecipe);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(blob.type, "application/pdf");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.length > 5_000);
  assert.equal(recipePdfFilename(sampleRecipe), "salmon-con-espinacas-al-limon-nutricionapp.pdf");
});

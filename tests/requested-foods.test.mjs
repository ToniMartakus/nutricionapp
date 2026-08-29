import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/recipes/route.ts";

const baseConfig = {
  adults: 2,
  children: 0,
  lunches: 1,
  dinners: 0,
  timeBand: "quick",
  tools: ["Sartén"],
  otherTool: "",
  allergies: "",
  avoid: "",
  include: "",
};

async function postConfig(config) {
  return POST(new Request("http://local.test/api/recipes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  }));
}

test("rechaza un alimento solicitado que entra en conflicto con una alergia", async () => {
  const response = await postConfig({ ...baseConfig, allergies: "lactosa", include: "queso" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INCLUDE_CONFLICT");
});

test("rechaza alcohol solicitado para un menú infantil", async () => {
  const response = await postConfig({ ...baseConfig, children: 1, include: "vino" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "UNSAFE_FOR_CHILDREN");
});

test("limita los alimentos solicitados a tres", async () => {
  const response = await postConfig({ ...baseConfig, include: "arroz, patata, boniato, maíz" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Configuración no válida." });
});

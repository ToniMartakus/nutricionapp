import { POST as generateRecipes } from "../../../app/api/recipes/route.ts";

const runtime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

const ALLOWED_ORIGINS = new Set([
  "https://tonimartakus.github.io",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "content-type, x-family-code",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(data: unknown, status: number, headers: Headers) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(data, { status, headers });
}

function safeEqual(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(actual);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

runtime.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origen no autorizado." }, 403, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405, headers);
  }

  const expectedCode = runtime.env.get("FAMILY_ACCESS_CODE")?.trim();
  const providedCode = request.headers.get("x-family-code")?.trim() ?? "";
  if (!expectedCode) {
    return json({ error: "El acceso familiar aún no está configurado." }, 503, headers);
  }
  if (!safeEqual(providedCode, expectedCode)) {
    return json({ code: "ACCESS_DENIED", error: "El código familiar no es correcto. Inténtalo de nuevo." }, 401, headers);
  }

  try {
    const response = await generateRecipes(request);
    const responseHeaders = new Headers(response.headers);
    headers.forEach((value, key) => responseHeaders.set(key, value));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return json({ error: "No se pudo procesar la solicitud." }, 500, headers);
  }
});

import { loadOfficialRates } from "./official-source.js";
import { GoogleSheetAccessError } from "./rates-source.js";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

// Public endpoint. The browser and Google Sheet requests need no credentials.
export async function ratesResponse(request, fetcher = fetch) {
  if (request.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, {
      status: 405, headers: { ...headers, Allow: "GET" },
    });
  }
  try {
    const rates = await loadOfficialRates(fetcher);
    return Response.json({
      rates,
      source: "google",
      sourceLabel: "Planilla oficial de Drive",
      checkedAt: new Date().toISOString(),
    }, { headers });
  } catch (error) {
    const denied = error instanceof GoogleSheetAccessError;
    return Response.json({
      code: denied ? "source_access_denied" : "source_unavailable",
      error: denied
        ? "La planilla oficial requiere acceso de lectura en Google Drive. No se pueden calcular cuotas hasta habilitarlo."
        : "No se pudo leer la tabla de la planilla oficial. No se calcularán cuotas hasta recuperar su lectura.",
    }, { status: 503, headers });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/rates") return ratesResponse(request);
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Ruta no encontrada." }, { status: 404, headers });
    }
    return env.ASSETS.fetch(request);
  },
};

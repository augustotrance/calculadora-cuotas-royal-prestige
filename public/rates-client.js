// Keep no local or persisted table: a failed read immediately clears the result.
export function createRatesReader(fetcher = fetch, onChange = () => {}) {
  const state = { data: null, error: "", loading: true };
  let active = false;

  async function refresh(showLoading = false) {
    if (active) return;
    active = true;
    if (showLoading) {
      state.loading = true;
      onChange();
    }
    try {
      const response = await fetcher("/api/rates", {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(12_000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo leer la tabla oficial.");
      if (body.source !== "google" || !Array.isArray(body.rates) || body.rates.length !== 23 || !Number.isFinite(Date.parse(body.checkedAt))) {
        throw new Error("No se pudo leer la tabla de coeficientes.");
      }
      state.data = body;
      state.error = "";
    } catch (error) {
      state.data = null;
      state.error = error instanceof Error ? error.message : "No se pudo leer la tabla oficial.";
    } finally {
      state.loading = false;
      active = false;
      onChange();
    }
  }

  return { state, refresh };
}

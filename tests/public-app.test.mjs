import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { ratesResponse } from "../src/worker.js";
import { createRatesReader } from "../public/rates-client.js";
import { calculateInstallment } from "../public/calculation.js";
import { OFFICIAL_SHEET_ID } from "../src/official-source.js";

const { rates } = JSON.parse(await readFile(new URL("./fixtures/september-reference.json", import.meta.url), "utf8"));
const csv = ["Cuotas,Porcentaje", ...rates.map((r) => `${r.installments},${(r.coefficientBps / 100).toFixed(2)}`)].join("\n");
const request = () => new Request("https://calculator.example/api/rates");
const validData = (nextRates = rates) => ({ rates: nextRates, source: "google", sourceLabel: "Planilla oficial de Drive", checkedAt: new Date().toISOString() });

test("an anonymous request reads only the official spreadsheet and never sends credentials to Google", async () => {
  let calls = 0;
  const response = await ratesResponse(request(), async (url, options) => {
    calls++;
    assert.equal(new URL(url).pathname, `/spreadsheets/d/${OFFICIAL_SHEET_ID}/gviz/tq`);
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    return new Response(csv, { headers: { "Content-Type": "text/csv" } });
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  const body = await response.json();
  assert.deepEqual(body.rates, rates);
  assert.equal(body.source, "google");
  assert.equal(calls, 1);
});

test("the public endpoint returns no quote data if Google denies access or its table is unavailable", async () => {
  for (const status of [401, 403, 500]) {
    const response = await ratesResponse(request(), async () => new Response("Unavailable", { status }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.rates, undefined);
    assert.equal(body.code, status === 500 ? "source_unavailable" : "source_access_denied");
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
  const incomplete = await ratesResponse(request(), async () => new Response("Cuotas,Porcentaje\n24,8.00"));
  assert.equal(incomplete.status, 503);
});

test("static assets are public; unsupported API routes and write requests return appropriate errors", async () => {
  const publicPage = await worker.fetch(new Request("https://calculator.example/"), {
    ASSETS: { fetch: async () => new Response("Public calculator") },
  });
  assert.equal(await publicPage.text(), "Public calculator");
  const missing = await worker.fetch(new Request("https://calculator.example/api/missing"), {});
  assert.equal(missing.status, 404);
  const write = await ratesResponse(new Request(request(), { method: "POST" }), () => { throw new Error("Must not fetch"); });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("Allow"), "GET");
});

test("an already-open calculator clears its old rates after failure and recovers with changed official rates", async () => {
  let reads = 0;
  const changed = rates.map((r) => ({ ...r, coefficientBps: r.installments === 24 ? 900 : r.coefficientBps }));
  const reader = createRatesReader(async (url, options) => {
    assert.equal(url, "/api/rates");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    reads++;
    if (reads === 2) return Response.json({ error: "No se puede leer la planilla oficial." }, { status: 503 });
    return Response.json(validData(reads === 1 ? rates : changed));
  });
  await reader.refresh();
  assert.equal(calculateInstallment(100_000_000, reader.state.data.rates.at(-1)).installmentPesos, 80000);
  await reader.refresh();
  assert.equal(reader.state.data, null);
  assert.match(reader.state.error, /planilla oficial/);
  await reader.refresh(true);
  assert.equal(reader.state.error, "");
  assert.equal(calculateInstallment(100_000_000, reader.state.data.rates.at(-1)).installmentPesos, 90000);
});

test("network errors and malformed responses cannot keep an earlier rate table active", async () => {
  for (const failure of [
    async () => { throw new TypeError("Failed to fetch"); },
    async () => Response.json({ rates }),
    async () => new Response("Not JSON"),
  ]) {
    let first = true;
    const reader = createRatesReader(async () => {
      if (first) { first = false; return Response.json(validData()); }
      return failure();
    });
    await reader.refresh();
    assert.ok(reader.state.data);
    await reader.refresh();
    assert.equal(reader.state.data, null);
    assert.ok(reader.state.error);
    assert.equal(reader.state.loading, false);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateInstallment, parseBalance, MAX_BALANCE_CENTS } from '../public/calculation.js';
import { googleCsvUrl, parseCsv, ratesFromCsv, loadGoogleRates, GoogleSheetAccessError } from '../src/rates-source.js';
import { loadOfficialRates, OFFICIAL_SHEET_ID } from '../src/official-source.js';
const official = JSON.parse(await readFile(new URL('./fixtures/september-reference.json', import.meta.url), 'utf8'));
const rates = official.rates;
const byN = n => rates.find(r => r.installments === n);
const csv = rows => ['"El siguiente cuadro especifica el coeficiente actual",,,', ',,,', 'CANTIDAD DE PAGOS,Cuotas,Porcentaje,% SALDO A FINANCIAR', ...rows.map(r => `,${r.installments},${(r.coefficientBps / 100).toFixed(2)},`)].join('\r\n');

test('calculates from the 23-coefficient reference fixture', () => {
  assert.deepEqual(rates.map(r => r.installments), Array.from({length:23}, (_, i) => i + 2));
  assert.deepEqual(rates.map(r => r.coefficientBps), [5408,3745,2889,2377,2037,1795,1614,1473,1362,1271,1196,1133,1079,1033,993,958,927,900,875,854,834,816,800]);
  assert.equal(calculateInstallment(100_000_000, byN(24)).installmentPesos, 80000);
  assert.equal(calculateInstallment(100_000_000, byN(6)).installmentPesos, 203700);
});

test('matches all seven amounts for the first product in the first sheet, including half-peso rounding', () => {
  const expected = new Map([[3,1884859],[6,1025222],[9,741361],[12,601947],[14,543061],[18,466559],[24,402640]]);
  for (const [n, amount] of expected) assert.equal(calculateInstallment(503_300_000, byN(n)).installmentPesos, amount);
});

test('accepts common Argentine amount inputs without confusing thousands and decimals', () => {
  for (const input of ['1000000', '1.000.000', '$ 1.000.000', 'ARS $ 1.000.000']) assert.equal(parseBalance(input), 100_000_000);
  assert.equal(parseBalance('1.000.000,50'), 100_000_050);
  assert.equal(parseBalance('1000000.50'), 100_000_050);
  assert.equal(parseBalance('12,5'), 1250);
  assert.equal(parseBalance('1.234'), 123400);
  for (const input of ['', '-1', 'NaN', 'Infinity', '1e6', '12foo', '1,000,000', '1.00.000', '1,234', '1000000001']) assert.equal(parseBalance(input), null);
});

test('rejects invalid balances, counts, and coefficients', () => {
  for (const b of [0,-1,0.5,NaN,MAX_BALANCE_CENTS+1]) assert.throws(() => calculateInstallment(b, byN(24)));
  assert.throws(() => calculateInstallment(100, {installments:25,coefficientBps:800}));
  assert.throws(() => calculateInstallment(100, {installments:24,coefficientBps:0}));
});

test('reads the original second-sheet structure, numeric coefficients and formatted percentages', () => {
  assert.deepEqual(ratesFromCsv(csv(rates)), rates);
  const localized = ['Cuotas;Porcentaje', ...rates.map(r => `${r.installments};${(r.coefficientBps / 100).toFixed(2).replace('.', ',')}%`)].join('\n');
  assert.deepEqual(ratesFromCsv(localized), rates);
  assert.deepEqual(parseCsv('"a,b","uno""dos"\r\n1,2'), [['a,b','uno"dos'],['1','2']]);
});

test('rejects incomplete, duplicate, corrupt and inaccessible live tables', () => {
  assert.throws(() => ratesFromCsv(csv(rates.slice(1))));
  assert.throws(() => ratesFromCsv(csv([...rates, rates[0]])));
  assert.throws(() => ratesFromCsv('<html>Please sign in</html>'));
  assert.throws(() => ratesFromCsv('Cuotas,Porcentaje\n24,0.08'));
  assert.throws(() => ratesFromCsv(csv(rates).replace('54.08', 'bad')));
  assert.throws(() => parseCsv('"unfinished'));
});

test('targets the selected Google tab and restricts source URLs to Google Sheets', () => {
  let u = new URL(googleCsvUrl('https://docs.google.com/spreadsheets/d/test-sheet/edit#gid=987'));
  assert.equal(u.searchParams.get('gid'), '987');
  assert.equal(u.searchParams.get('tqx'), 'out:csv');
  u = new URL(googleCsvUrl('https://docs.google.com/spreadsheets/d/test-sheet/edit'));
  assert.equal(u.searchParams.get('sheet'), 'Table 2');
  u = new URL(googleCsvUrl('https://docs.google.com/spreadsheets/d/e/test-published/pubhtml?gid=123&single=true'));
  assert.equal(u.searchParams.get('output'), 'csv');
  assert.equal(u.searchParams.get('gid'), '123');
  for (const url of ['http://docs.google.com/spreadsheets/d/x', 'https://example.com/x', 'https://docs.google.com.evil.example/x', 'https://user:pass@docs.google.com/spreadsheets/d/x', 'https://docs.google.com/spreadsheets/d/x/edit#gid=evil']) assert.throws(() => googleCsvUrl(url));
});

test('fetches fresh coefficients on each read and fails instead of using the old table', async () => {
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    const next = rates.map(r => ({...r}));
    if (requests++ > 0) next.find(r => r.installments === 24).coefficientBps = 900;
    return new Response(csv(next), {headers:{'content-type':'text/csv'}});
  };
  const url = 'https://docs.google.com/spreadsheets/d/test-sheet/edit#gid=123';
  const first = await loadGoogleRates(url, fakeFetch);
  const second = await loadGoogleRates(url, fakeFetch);
  assert.equal(calculateInstallment(100_000_000, first.find(r => r.installments === 24)).installmentPesos, 80000);
  assert.equal(calculateInstallment(100_000_000, second.find(r => r.installments === 24)).installmentPesos, 90000);
  assert.equal(requests, 2);
  await assert.rejects(loadGoogleRates(url, async () => new Response('Sign in', {headers:{'content-type':'text/html'}})));
  await assert.rejects(loadGoogleRates(url, async () => new Response('Unavailable', {status:503})));
});

test('the application reads only the authorized Drive workbook and has no fallback when access fails', async () => {
  let calls = 0;
  const received = await loadOfficialRates(async (url) => {
    calls++;
    const requested = new URL(url);
    assert.equal(requested.hostname, 'docs.google.com');
    assert.ok(requested.pathname.includes(`/d/${OFFICIAL_SHEET_ID}/`));
    assert.equal(requested.searchParams.get('sheet'), 'Table 2');
    return new Response(csv(rates), {headers:{'content-type':'text/csv'}});
  });
  assert.deepEqual(received, rates);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(loadOfficialRates(async () => {
    calls++;
    return new Response('Sign in required', {status:401,headers:{'content-type':'text/html'}});
  }), GoogleSheetAccessError);
  assert.equal(calls, 1);
});

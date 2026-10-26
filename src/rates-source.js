export class GoogleSheetAccessError extends Error {
    constructor() { super("La planilla oficial requiere acceso de lectura en Google Drive."); this.name = "GoogleSheetAccessError"; }
}
function normalize(text) { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
export function googleCsvUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error("El enlace de Google Sheets no es válido.");
    }
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.username || url.password || url.port)
        throw new Error("Usá un enlace HTTPS de docs.google.com.");
    const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)\/pub(?:html)?\/?$/);
    const native = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/.*)?$/);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const gid = url.searchParams.get("gid") ?? fragment.get("gid");
    if (gid !== null && !/^\d+$/.test(gid))
        throw new Error("El identificador de la hoja no es válido.");
    if (published) {
        const target = new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`);
        target.searchParams.set("output", "csv");
        if (gid !== null)
            target.searchParams.set("gid", gid);
        target.searchParams.set("single", "true");
        return target.toString();
    }
    if (!native || native[1] === "e")
        throw new Error("El enlace no corresponde a una hoja de cálculo de Google.");
    const target = new URL(`https://docs.google.com/spreadsheets/d/${native[1]}/gviz/tq`);
    target.searchParams.set("tqx", "out:csv");
    if (gid !== null)
        target.searchParams.set("gid", gid);
    else
        target.searchParams.set("sheet", "Table 2");
    return target.toString();
}
export function parseCsv(text) {
    if (text.length > 200_000 || /^\s*</.test(text))
        throw new Error("No se pudo leer la tabla de coeficientes.");
    text = text.replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/, 1)[0];
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (quoted || cell.length === 0)
                quoted = !quoted;
            else
                throw new Error("La tabla contiene un campo CSV inválido.");
        }
        else if (!quoted && ch === delimiter) {
            row.push(cell);
            cell = "";
        }
        else if (!quoted && (ch === "\n" || ch === "\r")) {
            if (ch === "\r" && text[i + 1] === "\n")
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        }
        else
            cell += ch;
    }
    if (quoted)
        throw new Error("La tabla contiene un campo CSV incompleto.");
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
export function ratesFromCsv(csv) {
    const rows = parseCsv(csv);
    const headerIndex = rows.findIndex(r => r.some(c => ["cuotas", "cantidad de cuotas", "cantidad de pagos"].includes(normalize(c))) && r.some(c => ["porcentaje", "coeficiente"].includes(normalize(c))));
    if (headerIndex < 0)
        throw new Error("La hoja debe contener las columnas Cuotas y Porcentaje.");
    const headers = rows[headerIndex].map(normalize);
    // Prefer the explicit Cuotas column; the official sheet has an empty introductory column.
    let nIndex = headers.indexOf("cuotas");
    if (nIndex < 0)
        nIndex = headers.findIndex(c => c === "cantidad de cuotas" || c === "cantidad de pagos");
    const pIndex = headers.findIndex(c => c === "porcentaje" || c === "coeficiente");
    const found = new Map();
    for (const row of rows.slice(headerIndex + 1)) {
        const nText = (row[nIndex] ?? "").trim();
        if (!nText && !(row[pIndex] ?? "").trim())
            continue;
        if (!/^\d+$/.test(nText))
            throw new Error("La columna Cuotas contiene un valor inválido.");
        const installments = Number(nText);
        if (installments < 2 || installments > 24 || found.has(installments))
            throw new Error("Revisá las cuotas de la tabla: deben figurar una vez, de 2 a 24.");
        const rateText = (row[pIndex] ?? "").trim().replace(/\s*%$/, "").replace(",", ".");
        if (!/^\d+(?:\.\d{1,2})?$/.test(rateText))
            throw new Error(`El coeficiente de ${installments} cuotas no es válido.`);
        const coefficientBps = Math.round(Number(rateText) * 100);
        if (coefficientBps <= 0 || coefficientBps > 10000 || coefficientBps * installments < 10000)
            throw new Error(`Revisá el porcentaje para ${installments} cuotas.`);
        found.set(installments, { installments, coefficientBps });
    }
    if (found.size !== 23)
        throw new Error("La tabla debe contener todos los coeficientes de 2 a 24 cuotas.");
    return [...found.values()].sort((a, b) => a.installments - b.installments);
}
export async function loadGoogleRates(source, fetcher = fetch) {
    const response = await fetcher(googleCsvUrl(source), { signal: AbortSignal.timeout(8000), redirect: "follow", cache: "no-store", credentials: "omit" });
    if (response.status === 401 || response.status === 403)
        throw new GoogleSheetAccessError();
    if (!response.ok || /text\/html/.test(response.headers.get("content-type") ?? ""))
        throw new Error("La planilla no permite leer la tabla de coeficientes.");
    const text = await response.text();
    return ratesFromCsv(text);
}

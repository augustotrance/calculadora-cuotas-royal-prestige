import { calculateInstallment, formatBalance, formatCoefficient, formatPesos, parseBalance } from "./calculation.js";
import { createRatesReader } from "./rates-client.js";

const byId = (id) => document.getElementById(id);
const balance = byId("balance");
const installments = byId("installments");
let selectedInstallments = 24;
const reader = createRatesReader(fetch, render);

function render() {
  const { data, error, loading } = reader.state;
  const balanceCents = parseBalance(balance.value);
  const inputError = balance.value.trim() && (balanceCents === null || balanceCents <= 0)
    ? "Ingresá un saldo válido mayor a cero, con hasta dos decimales." : "";
  const rate = data?.rates.find((r) => r.installments === selectedInstallments);
  let result = null;
  if (rate && balanceCents !== null && balanceCents > 0 && !error) {
    try { result = calculateInstallment(balanceCents, rate); } catch { /* Show no quote for invalid data. */ }
  }

  byId("amount-input").classList.toggle("input-invalid", Boolean(inputError));
  balance.setAttribute("aria-invalid", String(Boolean(inputError)));
  if (inputError) balance.setAttribute("aria-describedby", "amount-error");
  else balance.removeAttribute("aria-describedby");
  byId("amount-error").textContent = inputError;
  byId("amount-error").hidden = !inputError;

  const available = data?.rates ?? Array.from({ length: 23 }, (_, i) => ({ installments: i + 2 }));
  const values = available.map((r) => r.installments).join(",");
  if (installments.dataset.values !== values) {
    installments.replaceChildren(...available.map((r) => new Option(`${r.installments} cuotas`, String(r.installments))));
    installments.dataset.values = values;
  }
  installments.value = String(selectedInstallments);
  installments.disabled = loading || Boolean(error) || !data;

  const amountText = result ? formatPesos(result.installmentPesos) : "$ —";
  byId("result").classList.toggle("has-result", Boolean(result));
  byId("result-accessible").textContent = result ? `${selectedInstallments} cuotas de ` : "";
  byId("result-amount").textContent = amountText;
  byId("result-amount").parentElement.style.fontSize = `${Math.min(52, 470 / amountText.length)}px`;
  byId("result-terms").textContent = result ? `${result.installments} cuotas`
    : loading ? "Cargando coeficientes…" : error ? "Tabla no disponible" : "Completá el saldo para calcular";
  byId("coefficient").hidden = !rate || Boolean(error);
  byId("coefficient-value").textContent = rate && !error ? formatCoefficient(rate.coefficientBps) : "";
  byId("source-error").hidden = !error;
  byId("source-error-text").textContent = error;
  byId("retry").disabled = loading;
  byId("retry").querySelector("svg").classList.toggle("spin", loading);
  byId("retry-label").textContent = loading ? "Actualizando…" : "Reintentar";
  byId("rounding-note").hidden = Boolean(error);
  byId("source-dot").classList.toggle("pending", loading);
  byId("source-dot").classList.toggle("unavailable", !loading && Boolean(error));
  byId("source-label").textContent = loading ? "Leyendo tabla…" : error ? "Planilla oficial sin acceso" : data?.sourceLabel ?? "Planilla oficial de Drive";
  byId("source-time").textContent = data && !error ? new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(data.checkedAt)) : "";
}

balance.addEventListener("input", render);
balance.addEventListener("blur", () => {
  const cents = parseBalance(balance.value);
  if (cents !== null) balance.value = formatBalance(cents);
  render();
});
installments.addEventListener("change", () => {
  selectedInstallments = Number(installments.value);
  render();
});
byId("retry").addEventListener("click", () => void reader.refresh(true));
const refreshIfVisible = () => {
  if (document.visibilityState === "visible") void reader.refresh();
};
document.addEventListener("visibilitychange", refreshIfVisible);
window.addEventListener("focus", refreshIfVisible);
setInterval(refreshIfVisible, 60_000);
render();
void reader.refresh();

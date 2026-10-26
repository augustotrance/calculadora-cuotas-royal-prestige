import { calculateInstallment, calculatePendingBalance, formatBalance, formatMoney, formatCoefficient, formatPesos, parseBalance } from "./calculation.js";
import { createRatesReader } from "./rates-client.js";
import { formatAmountInput, deleteAtGroupSeparator } from "./amount-input.js";

const byId = (id) => document.getElementById(id);
const balance = byId("balance");
const totalPrice = byId("total-price");
const advance = byId("advance");
const installments = byId("installments");
let mode = "balance";
let selectedInstallments = 24;
const reader = createRatesReader(fetch, render);

function fieldError(input, containerId, messageId, message) {
  byId(containerId).classList.toggle("input-invalid", Boolean(message));
  input.setAttribute("aria-invalid", String(Boolean(message)));
  if (message) input.setAttribute("aria-describedby", messageId);
  else input.removeAttribute("aria-describedby");
  byId(messageId).textContent = message;
  byId(messageId).hidden = !message;
}

function render() {
  const { data, error, loading } = reader.state;
  const complete = mode === "complete";
  let balanceCents = parseBalance(balance.value);
  const inputError = !complete && balance.value.trim() && (balanceCents === null || balanceCents <= 0)
    ? "Ingresá un saldo válido mayor a cero, con hasta dos decimales." : "";
  const priceCents = parseBalance(totalPrice.value);
  const advanceCents = advance.value.trim() ? parseBalance(advance.value) : 0;
  const priceError = complete && totalPrice.value.trim() && (priceCents === null || priceCents <= 0)
    ? "Ingresá un precio total válido mayor a cero, con hasta dos decimales." : "";
  let advanceError = complete && advanceCents === null
    ? "Ingresá un adelanto válido, mayor o igual a cero, con hasta dos decimales." : "";
  if (complete) {
    balanceCents = null;
    if (priceCents !== null && priceCents > 0 && advanceCents !== null) {
      try { balanceCents = calculatePendingBalance(priceCents, advanceCents); }
      catch (validationError) { advanceError = validationError.message; }
    }
  }

  byId("balance-field").hidden = complete;
  byId("complete-fields").hidden = !complete;
  byId("intro-description").textContent = complete
    ? "Ingresá el precio, el adelanto y elegí las cuotas."
    : "Ingresá el saldo y elegí las cuotas.";
  byId("pending-balance").textContent = balanceCents !== null && complete
    ? formatMoney(balanceCents) : "$ —";
  fieldError(balance, "amount-input", "amount-error", inputError);
  fieldError(totalPrice, "price-input", "price-error", priceError);
  fieldError(advance, "advance-input", "advance-error", advanceError);

  const rate = data?.rates.find((r) => r.installments === selectedInstallments);
  let result = null;
  if (rate && balanceCents !== null && balanceCents > 0 && !error) {
    try { result = calculateInstallment(balanceCents, rate); } catch { /* Show no quote for invalid data. */ }
  }

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
    : loading ? "Cargando coeficientes…" : error ? "Tabla no disponible"
    : complete && balanceCents === 0 ? "Sin saldo pendiente para financiar"
    : complete ? "Completá el precio y el adelanto para calcular" : "Completá el saldo para calcular";
  byId("coefficient").hidden = !rate || Boolean(error);
  byId("coefficient-value").textContent = rate && !error ? formatCoefficient(rate.coefficientBps) : "";
  byId("source-error").hidden = !error;
  byId("source-error-text").textContent = error;
  byId("retry").disabled = loading;
  byId("retry").querySelector("svg").classList.toggle("spin", loading);
  byId("retry-label").textContent = loading ? "Actualizando…" : "Reintentar";
  byId("source-dot").classList.toggle("pending", loading);
  byId("source-dot").classList.toggle("unavailable", !loading && Boolean(error));
  byId("source-label").textContent = loading ? "Leyendo tabla…" : error ? "Planilla oficial sin acceso" : data?.sourceLabel ?? "Planilla oficial de Drive";
  byId("source-time").textContent = data && !error ? new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(data.checkedAt)) : "";
}

for (const input of [balance, totalPrice, advance]) {
  const applyEdit = (edit) => {
    if (input.value !== edit.value) {
      input.value = edit.value;
      input.setSelectionRange(edit.start, edit.end);
    }
    render();
  };
  const formatWhileTyping = (event) => {
    if (event.isComposing) return;
    applyEdit(formatAmountInput(input.value, input.selectionStart, input.selectionEnd, event.inputType, event.data));
  };
  input.addEventListener("input", formatWhileTyping);
  input.addEventListener("compositionend", formatWhileTyping);
  input.addEventListener("beforeinput", (event) => {
    if (event.isComposing || !event.cancelable) return;
    const edit = deleteAtGroupSeparator(input.value, input.selectionStart, input.selectionEnd, event.inputType);
    if (edit) { event.preventDefault(); applyEdit(edit); }
  });
  input.addEventListener("blur", () => {
    const cents = parseBalance(input.value);
    if (cents !== null) input.value = formatBalance(cents);
    render();
  });
}
document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) { mode = input.value; render(); }
  });
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

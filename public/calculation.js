export const MAX_BALANCE_CENTS = 100_000_000_000;
// Argentina-style amounts: 1000000, 1.000.000, 1.000.000,50, or 1000000.50.
export function parseBalance(raw) {
    let text = raw.trim().replace(/^(?:ARS\s*)?\$?\s*/i, "").replace(/[\s\u00a0]/g, "");
    if (!text)
        return null;
    if (text.includes(",")) {
        if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(text))
            return null;
        text = text.replace(/\./g, "").replace(",", ".");
    }
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(text))
        text = text.replace(/\./g, "");
    if (!/^\d+(?:\.\d{0,2})?$/.test(text))
        return null;
    const [whole, fractional = ""] = text.split(".");
    if (whole.length > 12)
        return null;
    const cents = BigInt(whole) * BigInt(100) + BigInt(fractional.padEnd(2, "0"));
    if (cents > BigInt(MAX_BALANCE_CENTS))
        return null;
    return Number(cents);
}
export function calculateInstallment(balanceCents, rate) {
    if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0 || balanceCents > MAX_BALANCE_CENTS)
        throw new Error("Ingresá un saldo válido mayor a cero.");
    if (!Number.isInteger(rate.installments) || rate.installments < 2 || rate.installments > 24)
        throw new Error("Elegí entre 2 y 24 cuotas.");
    if (!Number.isInteger(rate.coefficientBps) || rate.coefficientBps <= 0 || rate.coefficientBps > 10000)
        throw new Error("El coeficiente de la tabla no es válido.");
    // The official coefficient gives ONE installment, including financing.
    // Both source sheets round each installment to the nearest whole peso.
    const installmentPesos = Number((BigInt(balanceCents) * BigInt(rate.coefficientBps) + BigInt(500000)) / BigInt(1000000));
    return { installmentPesos, installments: rate.installments, coefficientBps: rate.coefficientBps };
}
export const formatPesos = (pesos) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(pesos);
export const formatBalance = (cents) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const formatCoefficient = (bps) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bps / 100) + "%";

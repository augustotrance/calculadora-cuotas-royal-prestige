// Group the integer part as text so typing never rounds or drops digits.
export function formatAmountInput(raw, start = raw.length, end = start, inputType = "", data = null) {
  let source = raw;
  if (inputType === "insertText" && data === "." && !source.includes(",") && source[start - 1] === ".") {
    source = source.slice(0, start - 1) + "," + source.slice(start);
  }
  let text = source.trim().replace(/^(?:ARS\s*)?\$?\s*/i, "").replace(/[\s\u00a0]/g, "");
  const external = inputType === "insertFromPaste" || inputType === "insertFromDrop" || (data?.length ?? 0) > 1;
  // Preserve decimal-dot amounts pasted from a calculator or another app.
  // During ordinary deletion, dots already in the field remain grouping marks.
  if (external && /^\d+\.\d{0,2}$/.test(text)) {
    const dot = source.lastIndexOf(".");
    source = source.slice(0, dot) + "," + source.slice(dot + 1);
    text = text.replace(".", ",");
  }
  if (!/^[\d.]*(?:,\d{0,2})?$/.test(text)) return { value: raw, start, end };
  const hasComma = text.includes(",");
  const [whole, fraction = ""] = text.split(",");
  const digits = whole.replace(/\./g, "");
  if (!digits && !hasComma) return { value: "", start: 0, end: 0 };
  const addedZero = !digits && hasComma;
  const integer = (digits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const value = integer + (hasComma ? "," + fraction : "");
  const mapPosition = (position) => {
    let remaining = source.slice(0, position).replace(/[^\d,]/g, "").length;
    if (addedZero && position > 0) remaining++;
    if (!remaining) return 0;
    for (let i = 0; i < value.length; i++) {
      if (/[\d,]/.test(value[i]) && --remaining === 0) return i + 1;
    }
    return value.length;
  };
  return { value, start: mapPosition(start), end: mapPosition(end) };
}

// Backspace/Delete skip generated dots instead of getting stuck on a separator.
export function deleteAtGroupSeparator(value, start, end, inputType) {
  if (start !== end) return null;
  const backward = inputType === "deleteContentBackward";
  if (!backward && inputType !== "deleteContentForward") return null;
  const separator = backward ? start - 1 : start;
  if (value[separator] !== ".") return null;
  const from = backward ? Math.max(0, start - 2) : start;
  const to = backward ? start : Math.min(value.length, start + 2);
  return formatAmountInput(value.slice(0, from) + value.slice(to), from);
}

import test from "node:test";
import assert from "node:assert/strict";
import { formatAmountInput, deleteAtGroupSeparator } from "../public/amount-input.js";
import { parseBalance } from "../public/calculation.js";

test("typing progressively adds dots while retaining every digit and the cursor at the end", () => {
  let value = "";
  const expected = ["1", "10", "100", "1.000", "10.000", "100.000", "1.000.000"];
  for (let i = 0; i < expected.length; i++) {
    const data = i === 0 ? "1" : "0";
    const raw = value + data;
    const edit = formatAmountInput(raw, raw.length, raw.length, "insertText", data);
    assert.equal(edit.value, expected[i]);
    assert.equal(edit.start, edit.value.length);
    assert.equal(edit.end, edit.start);
    assert.equal(parseBalance(edit.value), 10 ** i * 100);
    value = edit.value;
  }
});

test("removing digits from a formatted amount never turns grouping dots into decimal points", () => {
  const edit = formatAmountInput("12.34", 5, 5, "deleteContentBackward");
  assert.equal(edit.value, "1.234");
  assert.equal(parseBalance(edit.value), 123400);
  assert.equal(edit.start, 5);
  assert.equal(formatAmountInput("1.00.000", 4, 4, "deleteContentBackward").value, "100.000");
});

test("decimal commas and trailing cent zeros are kept while typing, including a decimal-dot mobile keyboard", () => {
  for (const [raw, expected] of [["1234567,", "1.234.567,"], ["1234567,5", "1.234.567,5"], ["1234567,50", "1.234.567,50"], [",5", "0,5"]]) {
    const edit = formatAmountInput(raw);
    assert.equal(edit.value, expected);
    assert.equal(edit.start, expected.length);
  }
  const decimalKey = formatAmountInput("1.000.", 6, 6, "insertText", ".");
  assert.equal(decimalKey.value, "1.000,");
  assert.equal(decimalKey.start, 6);
  assert.equal(formatAmountInput(",", 1, 1, "insertText", ",").start, 2);
});

test("pasting supported Argentine or decimal-dot amounts keeps their monetary value", () => {
  for (const [raw, expected] of [["1000000", "1.000.000"], ["$ 1.000.000,50", "1.000.000,50"], ["1000000.50", "1.000.000,50"], ["12.5", "12,5"], ["1.234", "1.234"]]) {
    const edit = formatAmountInput(raw, raw.length, raw.length, "insertFromPaste");
    assert.equal(edit.value, expected);
    assert.equal(parseBalance(edit.value), parseBalance(raw));
  }
});

test("edits in the middle keep the caret with the edited digits and preserve selection ranges", () => {
  assert.deepEqual(formatAmountInput("1000", 2), { value: "1.000", start: 3, end: 3 });
  assert.deepEqual(formatAmountInput("129000", 3), { value: "129.000", start: 3, end: 3 });
  assert.deepEqual(formatAmountInput("1234567", 1, 4), { value: "1.234.567", start: 1, end: 5 });
});

test("backspace and forward delete work across grouping dots without trapping the cursor", () => {
  assert.deepEqual(deleteAtGroupSeparator("12.345", 3, 3, "deleteContentBackward"), { value: "1.345", start: 1, end: 1 });
  assert.deepEqual(deleteAtGroupSeparator("12.345", 2, 2, "deleteContentForward"), { value: "1.245", start: 3, end: 3 });
  assert.equal(deleteAtGroupSeparator("12.345", 0, 3, "deleteContentBackward"), null);
  assert.equal(deleteAtGroupSeparator("12,50", 3, 3, "deleteContentBackward"), null);
});

test("clearing a field stays empty and invalid characters or extra decimals are not silently turned into a valid quote", () => {
  assert.deepEqual(formatAmountInput(""), { value: "", start: 0, end: 0 });
  for (const raw of ["-1000", "12foo", "1e6", "1.000,123", "1,000,000"]) {
    const edit = formatAmountInput(raw);
    assert.equal(edit.value, raw);
    assert.equal(parseBalance(edit.value), null);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { coerce, detectDelimiter, parseDelimited, parseJson } from "../src/parse.ts";

test("splits quoted fields containing the delimiter", () => {
  const { rows } = parseDelimited('name,note\n"Doe, John",ok');
  assert.equal(rows[0]!.name, "Doe, John");
  assert.equal(rows[0]!.note, "ok");
});

test("treats a doubled quote as an escaped quote", () => {
  const { rows } = parseDelimited('a\n"He said ""hi"""');
  assert.equal(rows[0]!.a, 'He said "hi"');
});

test("keeps a newline inside a quoted field in the same row", () => {
  const { rows } = parseDelimited('a,b\n"line1\nline2",x');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.a, "line1\nline2");
});

test("detects a semicolon file whose values contain commas", () => {
  const text = "name;role;age\nDoe, John;engineer;36\nRoe, Jane;analyst;41";
  assert.equal(detectDelimiter(text), ";");
  assert.equal(parseDelimited(text).columns.length, 3);
});

test("falls back to a comma for an ordinary comma file", () => {
  assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
});

test("makes duplicate and empty column names unique", () => {
  const { columns } = parseDelimited("a,a,\n1,2,3");
  assert.deepEqual(columns, ["a", "a_2", "column_3"]);
});

test("reads both decimal conventions", () => {
  assert.equal(coerce("1.234,56"), 1234.56);
  assert.equal(coerce("1,234.56"), 1234.56);
  assert.equal(coerce("1,5"), 1.5);
  assert.equal(coerce("1,234"), 1234);
});

test("maps blanks and placeholders to null", () => {
  for (const input of ["", "  ", "N/A", "null", "-"]) {
    assert.equal(coerce(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test("does not turn an identifier into a number", () => {
  assert.equal(coerce("CART-014"), "CART-014");
  assert.equal(coerce("007a"), "007a");
});

test("unions keys across JSON records and fills the gaps with null", () => {
  const { columns, rows } = parseJson('[{"a":1},{"b":2}]');
  assert.deepEqual(columns, ["a", "b"]);
  assert.equal(rows[0]!.b, null);
  assert.equal(rows[1]!.a, null);
});

test("unwraps a { data: [...] } envelope", () => {
  const { rows } = parseJson('{"data":[{"a":1}]}');
  assert.equal(rows.length, 1);
});

test("rejects an empty file", () => {
  assert.throws(() => parseDelimited("   "), /empty/i);
});

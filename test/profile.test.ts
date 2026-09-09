import { test } from "node:test";
import assert from "node:assert/strict";
import { profileColumn, profileTable, sampleRows } from "../src/profile.ts";
import { parseDelimited } from "../src/parse.ts";

test("computes numeric statistics over every row", () => {
  const column = profileColumn("x", [1, 2, 3, 4]);
  assert.equal(column.kind, "number");
  assert.deepEqual(column.stats, { min: 1, max: 4, mean: 2.5, median: 2.5, sum: 10 });
});

test("takes the median of an odd-length column", () => {
  assert.equal(profileColumn("x", [5, 1, 3]).stats?.median, 3);
});

test("counts missing values without letting them skew the mean", () => {
  const column = profileColumn("x", [2, null, 4]);
  assert.equal(column.missing, 1);
  assert.equal(column.stats?.mean, 3);
});

test("keeps a mostly-numeric column numeric despite a stray entry", () => {
  const values = [...Array(19).fill(1), "n/d"];
  assert.equal(profileColumn("x", values).kind, "number");
});

test("classifies dates in both conventions", () => {
  assert.equal(profileColumn("d", ["2026-01-05", "2026-02-09"]).kind, "date");
  assert.equal(profileColumn("d", ["05.01.2026", "09.02.2026"]).kind, "date");
});

test("reads a day-first date as day-first", () => {
  const column = profileColumn("d", ["03.09.2026", "09.03.2026"]);
  assert.equal(column.range?.earliest, "2026-03-09");
  assert.equal(column.range?.latest, "2026-09-03");
});

test("ranks the most frequent categories first", () => {
  const top = profileColumn("c", ["a", "b", "a", "c", "a", "b"]).topValues;
  assert.equal(top?.[0]?.value, "a");
  assert.equal(top?.[0]?.count, 3);
});

test("avoids floating point noise in the mean", () => {
  assert.equal(profileColumn("x", [0.1, 0.2]).stats?.sum, 0.3);
});

test("profiles a whole table", () => {
  const profile = profileTable(parseDelimited("n,c\n1,a\n2,b\n3,a"));
  assert.equal(profile.rowCount, 3);
  assert.equal(profile.columnCount, 2);
  assert.equal(profile.columns[0]!.stats?.sum, 6);
});

test("samples from the start, middle and end rather than the head", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ i }));
  const sample = sampleRows(rows, 12);
  assert.equal(sample.length, 12);
  assert.equal(sample[0]!.i, 0);
  assert.equal(sample[sample.length - 1]!.i, 99);
  // A head-only sample could not contain a row from the middle of the file.
  assert.ok(sample.some((r) => (r.i as number) > 30 && (r.i as number) < 70));
});

test("returns every row when the table is smaller than the sample", () => {
  assert.equal(sampleRows([{ a: 1 }, { a: 2 }], 12).length, 2);
});

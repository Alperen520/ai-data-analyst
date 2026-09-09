/**
 * Local data profiling.
 *
 * Every number the model is shown is computed here, in the browser, from the
 * full dataset. The model is asked to interpret those numbers, never to do
 * arithmetic on a sample and call the result a total - which is how "AI data
 * analysis" usually goes wrong.
 */

import type { CellValue, Row, Table } from "./parse.ts";

export type ColumnKind = "number" | "boolean" | "date" | "text";

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  missing: number;
  distinct: number;
  /** Numeric columns only. */
  stats?: { min: number; max: number; mean: number; median: number; sum: number };
  /** Categorical and boolean columns only. */
  topValues?: { value: string; count: number }[];
  /** Date columns only, ISO strings. */
  range?: { earliest: string; latest: string };
}

export interface Profile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;
const LOCAL_DATE = /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/;

function looksLikeDate(value: CellValue): boolean {
  if (typeof value !== "string") return false;
  return ISO_DATE.test(value) || LOCAL_DATE.test(value);
}

function toDate(value: string): Date | null {
  if (LOCAL_DATE.test(value)) {
    // Day-first is the convention in the locales this targets; month-first
    // would silently mis-sort 03.09 vs 09.03.
    const [day, month, year] = value.split(/[./-]/).map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function classify(values: CellValue[]): ColumnKind {
  const present = values.filter((v) => v !== null);
  if (present.length === 0) return "text";

  const numbers = present.filter((v) => typeof v === "number").length;
  if (numbers / present.length >= 0.9) return "number";

  const booleans = present.filter((v) => typeof v === "boolean").length;
  if (booleans / present.length >= 0.9) return "boolean";

  const dates = present.filter(looksLikeDate).length;
  if (dates / present.length >= 0.9) return "date";

  return "text";
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function round(n: number): number {
  // Six significant decimals is well past anything a summary needs, and it
  // keeps 0.1 + 0.2 from reaching the model as 0.30000000000000004.
  return Number.isInteger(n) ? n : Number(n.toFixed(6));
}

function topValues(values: CellValue[], limit = 5): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === null) continue;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

export function profileColumn(name: string, values: CellValue[]): ColumnProfile {
  const kind = classify(values);
  const present = values.filter((v) => v !== null);

  const profile: ColumnProfile = {
    name,
    kind,
    missing: values.length - present.length,
    distinct: new Set(present.map(String)).size,
  };

  if (kind === "number") {
    const numbers = present.filter((v): v is number => typeof v === "number");
    if (numbers.length > 0) {
      const sorted = [...numbers].sort((a, b) => a - b);
      const sum = numbers.reduce((a, b) => a + b, 0);
      profile.stats = {
        min: round(sorted[0]!),
        max: round(sorted[sorted.length - 1]!),
        mean: round(sum / numbers.length),
        median: round(median(sorted)),
        sum: round(sum),
      };
    }
  } else if (kind === "date") {
    const dates = present
      .map((v) => toDate(String(v)))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length > 0) {
      profile.range = {
        earliest: dates[0]!.toISOString().slice(0, 10),
        latest: dates[dates.length - 1]!.toISOString().slice(0, 10),
      };
    }
  } else {
    profile.topValues = topValues(present);
  }

  return profile;
}

export function profileTable(table: Table): Profile {
  return {
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    columns: table.columns.map((column) =>
      profileColumn(column, table.rows.map((row) => row[column] ?? null)),
    ),
  };
}

/**
 * Rows sent to the model as concrete examples.
 *
 * Taken from the head, the middle and the tail rather than the first N: files
 * are frequently sorted, and the first N rows of a sorted file misrepresent
 * the range of everything in it.
 */
export function sampleRows(rows: Row[], limit = 12): Row[] {
  if (rows.length <= limit) return rows;

  const perSection = Math.floor(limit / 3);
  const middleStart = Math.floor(rows.length / 2 - perSection / 2);

  return [
    ...rows.slice(0, perSection),
    ...rows.slice(middleStart, middleStart + perSection),
    ...rows.slice(rows.length - (limit - perSection * 2)),
  ];
}

/**
 * Delimited-text and JSON parsing.
 *
 * Written by hand rather than pulled from a library because the interesting
 * part of this project is what happens to the data afterwards, and a parser
 * that handles quoting correctly is about sixty lines.
 */

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;

export interface Table {
  columns: string[];
  rows: Row[];
}

const DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Picks the delimiter that yields the most consistent column count across the
 * first few lines. Counting occurrences on line 1 alone is fooled by a header
 * such as `name,surname` in a semicolon-separated file.
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 20);
  if (sample.length === 0) return ",";

  let best = ",";
  let bestScore = -Infinity;

  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => splitLine(line, delimiter).length);
    const first = counts[0]!;
    if (first < 2) continue;
    // Reward many columns, punish rows that disagree with the header.
    const disagreements = counts.filter((c) => c !== first).length;
    const score = first - disagreements * 2;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** Splits a single line, honouring double quotes and "" escapes. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field);
  return out;
}

/**
 * Splits the document into logical rows. A newline inside a quoted field is
 * part of the value, not a row break - the reason this cannot be a `.split("\n")`.
 */
function splitRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      records.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current !== "") records.push(current);
  return records.filter((r) => r.trim() !== "");
}

const NUMERIC = /^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

/**
 * Converts a raw cell to a typed value.
 *
 * Turkish-language exports are common in the data this was written for, so
 * "1.234,56" (dot thousands, comma decimal) is recognised alongside the
 * "1,234.56" convention. Ambiguous forms with a single separator are left as
 * numbers only when the grouping is unambiguous.
 */
export function coerce(raw: string): CellValue {
  const value = raw.trim();
  if (value === "") return null;

  const lower = value.toLowerCase();
  if (["true", "yes", "evet", "doğru"].includes(lower)) return true;
  if (["false", "no", "hayır", "yanlış"].includes(lower)) return false;
  if (["null", "na", "n/a", "-", "nan"].includes(lower)) return null;

  if (NUMERIC.test(value)) {
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    let normalized = value;

    if (lastComma !== -1 && lastDot !== -1) {
      // Whichever separator comes last is the decimal point.
      normalized =
        lastComma > lastDot
          ? value.replace(/\./g, "").replace(",", ".")
          : value.replace(/,/g, "");
    } else if (lastComma !== -1) {
      const decimals = value.length - lastComma - 1;
      // "1,234" is thousands grouping; "1,5" and "1,234567" are decimals.
      normalized = decimals === 3 ? value.replace(/,/g, "") : value.replace(",", ".");
    }

    const num = Number(normalized);
    if (Number.isFinite(num)) return num;
  }

  return value;
}

/** Makes column names unique and non-empty, since both break lookups downstream. */
function normalizeHeader(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((name, index) => {
    const base = name.trim() === "" ? `column_${index + 1}` : name.trim();
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export function parseDelimited(text: string, delimiter = detectDelimiter(text)): Table {
  const records = splitRecords(text);
  if (records.length === 0) throw new Error("The file is empty.");

  const columns = normalizeHeader(splitLine(records[0]!, delimiter));
  const rows: Row[] = [];

  for (const record of records.slice(1)) {
    const cells = splitLine(record, delimiter);
    const row: Row = {};
    columns.forEach((column, index) => {
      row[column] = coerce(cells[index] ?? "");
    });
    rows.push(row);
  }

  return { columns, rows };
}

export function parseJson(text: string): Table {
  const data: unknown = JSON.parse(text);
  const array = Array.isArray(data)
    ? data
    : // Tolerate the common { "data": [...] } / { "rows": [...] } wrapper.
      Object.values(data as Record<string, unknown>).find(Array.isArray);

  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("Expected a non-empty array of records in the JSON file.");
  }

  const columns: string[] = [];
  for (const item of array) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Expected the JSON array to contain objects.");
    }
    for (const key of Object.keys(item)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const rows = (array as Record<string, unknown>[]).map((item) => {
    const row: Row = {};
    for (const column of columns) {
      const value = item[column];
      row[column] =
        value === undefined || value === null
          ? null
          : typeof value === "object"
            ? JSON.stringify(value)
            : (value as CellValue);
    }
    return row;
  });

  return { columns, rows };
}

export function parseFile(name: string, text: string): Table {
  return name.toLowerCase().endsWith(".json") ? parseJson(text) : parseDelimited(text);
}

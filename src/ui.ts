/** Table rendering and question suggestions. */

import type { Table } from "./parse.ts";
import type { Profile } from "./profile.ts";

const PREVIEW_ROWS = 8;

function cell(tag: "td" | "th", text: string, className?: string): HTMLTableCellElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function renderPreview(table: HTMLTableElement, data: Table): void {
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of data.columns) headRow.append(cell("th", column));
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const row of data.rows.slice(0, PREVIEW_ROWS)) {
    const tr = document.createElement("tr");
    for (const column of data.columns) {
      const value = row[column];
      tr.append(
        value === null
          ? cell("td", "—", "empty")
          : cell("td", String(value), typeof value === "number" ? "num" : undefined),
      );
    }
    body.append(tr);
  }

  table.replaceChildren(head, body);
}

export function renderProfileTable(table: HTMLTableElement, profile: Profile): void {
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Column", "Type", "Missing", "Distinct", "Summary"]) {
    headRow.append(cell("th", label));
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const column of profile.columns) {
    const tr = document.createElement("tr");
    tr.append(cell("td", column.name));
    tr.append(cell("td", column.kind, "kind"));
    tr.append(cell("td", String(column.missing), "num"));
    tr.append(cell("td", String(column.distinct), "num"));

    let summary = "";
    if (column.stats) {
      summary = `min ${column.stats.min} · max ${column.stats.max} · mean ${column.stats.mean}`;
    } else if (column.range) {
      summary = `${column.range.earliest} → ${column.range.latest}`;
    } else if (column.topValues?.length) {
      summary = column.topValues.map((v) => `${v.value} (${v.count})`).join(", ");
    }
    tr.append(cell("td", summary, "summary"));
    body.append(tr);
  }

  table.replaceChildren(head, body);
}

/** Starter questions derived from what the file actually contains. */
export function suggestQuestions(profile: Profile): string[] {
  const questions = ["What stands out in this dataset?"];

  const numeric = profile.columns.find((c) => c.kind === "number");
  const categorical = profile.columns.find((c) => c.kind === "text" && c.distinct > 1 && c.distinct <= 30);
  const date = profile.columns.find((c) => c.kind === "date");
  const incomplete = profile.columns.find((c) => c.missing > 0);

  if (numeric && categorical) {
    questions.push(`How does "${numeric.name}" differ across "${categorical.name}"?`);
  } else if (numeric) {
    questions.push(`Is the distribution of "${numeric.name}" unusual in any way?`);
  }
  if (date) questions.push(`What does the time range of "${date.name}" tell me?`);
  if (incomplete) questions.push("Which data quality problems should I fix first?");

  return questions.slice(0, 4);
}

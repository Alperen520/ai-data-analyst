import "./style.css";
import { parseFile, type Table } from "./parse.ts";
import { profileTable, sampleRows, type Profile } from "./profile.ts";
import { ask } from "./api.ts";
import { renderPreview, renderProfileTable, suggestQuestions } from "./ui.ts";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const dropZone = el("drop");
const fileInput = el<HTMLInputElement>("file");
const datasetPanel = el("dataset");
const datasetName = el("dataset-name");
const datasetSummary = el("dataset-summary");
const previewTable = el<HTMLTableElement>("preview");
const profileTableEl = el<HTMLTableElement>("profile");
const askPanel = el("ask");
const askForm = el<HTMLFormElement>("ask-form");
const questionInput = el<HTMLTextAreaElement>("question");
const submitButton = el<HTMLButtonElement>("submit");
const suggestionsBox = el("suggestions");
const answerBox = el("answer");
const statusLine = el("status");
const languageSelect = el<HTMLSelectElement>("language");
const resetButton = el("reset");

interface Loaded {
  name: string;
  table: Table;
  profile: Profile;
}

let loaded: Loaded | null = null;
let inFlight: AbortController | null = null;

function setStatus(message: string, kind: "info" | "error" = "info") {
  statusLine.textContent = message;
  statusLine.className = `status ${kind}`;
  statusLine.hidden = message === "";
}

async function load(file: File) {
  setStatus("");
  try {
    const text = await file.text();
    const table = parseFile(file.name, text);

    if (table.rows.length === 0) throw new Error("No data rows were found in the file.");

    const profile = profileTable(table);
    loaded = { name: file.name, table, profile };

    datasetName.textContent = file.name;
    datasetSummary.textContent =
      `${profile.rowCount.toLocaleString()} rows · ${profile.columnCount} columns · ` +
      `${(file.size / 1024).toFixed(0)} KB`;

    renderPreview(previewTable, table);
    renderProfileTable(profileTableEl, profile);

    suggestionsBox.replaceChildren(
      ...suggestQuestions(profile).map((question) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.textContent = question;
        button.addEventListener("click", () => {
          questionInput.value = question;
          questionInput.focus();
        });
        return button;
      }),
    );

    dropZone.hidden = true;
    datasetPanel.hidden = false;
    askPanel.hidden = false;
    answerBox.hidden = true;
    questionInput.focus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The file could not be read.", "error");
  }
}

function reset() {
  inFlight?.abort();
  loaded = null;
  dropZone.hidden = false;
  datasetPanel.hidden = true;
  askPanel.hidden = true;
  answerBox.hidden = true;
  questionInput.value = "";
  fileInput.value = "";
  setStatus("");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void load(file);
});

resetButton.addEventListener("click", reset);

for (const event of ["dragenter", "dragover"] as const) {
  dropZone.addEventListener(event, (e) => {
    e.preventDefault();
    dropZone.classList.add("over");
  });
}
for (const event of ["dragleave", "drop"] as const) {
  dropZone.addEventListener(event, (e) => {
    e.preventDefault();
    dropZone.classList.remove("over");
  });
}
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) void load(file);
});

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loaded) return;

  const question = questionInput.value.trim();
  if (!question) return;

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  submitButton.disabled = true;
  answerBox.hidden = false;
  answerBox.textContent = "";
  setStatus("Thinking…");

  try {
    const result = await ask({
      fileName: loaded.name,
      question,
      profile: loaded.profile,
      sample: sampleRows(loaded.table.rows),
      language: languageSelect.value === "tr" ? "tr" : "en",
      signal: controller.signal,
      onDelta: (text) => {
        answerBox.textContent += text;
        answerBox.scrollTop = answerBox.scrollHeight;
      },
    });

    const { input, output, cacheRead } = result.usage;
    setStatus(
      `${input.toLocaleString()} input tokens (${cacheRead.toLocaleString()} cached) · ` +
        `${output.toLocaleString()} output` +
        (result.truncated ? " · answer was cut off at the token limit" : ""),
    );
  } catch (error) {
    if (controller.signal.aborted) return;
    setStatus(error instanceof Error ? error.message : "The request failed.", "error");
  } finally {
    if (inFlight === controller) inFlight = null;
    submitButton.disabled = false;
  }
});

// Ctrl/Cmd+Enter submits, matching the convention for multi-line inputs.
questionInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    askForm.requestSubmit();
  }
});

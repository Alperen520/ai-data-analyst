/**
 * Prompt construction.
 *
 * Kept apart from the transport so the exact text sent to the model is one
 * readable function rather than string concatenation buried in a route handler.
 */

import type { Profile } from "../src/profile.ts";
import type { Row } from "../src/parse.ts";

export interface AnalysisRequest {
  fileName: string;
  question: string;
  profile: Profile;
  sample: Row[];
  language: "tr" | "en";
}

const SYSTEM_EN = `You are a data analyst. You are given a statistical profile of a dataset and a small sample of its rows, then asked a question about the data.

The profile is computed from every row of the dataset. The sample is a handful of rows drawn from the start, middle and end, shown only so you can see the shape of real records.

Rules:
- Base every claim on the profile. It covers the whole dataset; the sample does not.
- Never present a figure derived from the sample as a total, count or average for the dataset.
- If the profile does not contain what is needed to answer, say so plainly and name the calculation that would be required.
- Quote concrete numbers from the profile rather than describing them vaguely.
- Note data quality problems you can see - missing values, a column typed as text because of stray entries, a suspicious range - when they bear on the question.
- Be concise. A few short paragraphs or a short list, not an essay. No preamble.`;

const SYSTEM_TR = `Bir veri analistisin. Sana bir veri kümesinin istatistiksel profili ve satırlarından küçük bir örneklem verilir, ardından veriyle ilgili bir soru sorulur.

Profil, veri kümesinin tüm satırlarından hesaplanmıştır. Örneklem ise yalnızca gerçek kayıtların biçimini görebilmen için baştan, ortadan ve sondan alınmış birkaç satırdır.

Kurallar:
- Her ifadeni profile dayandır. Profil veri kümesinin tamamını kapsar, örneklem kapsamaz.
- Örneklemden çıkardığın bir değeri asla veri kümesinin toplamı, sayısı veya ortalaması gibi sunma.
- Profil, soruyu yanıtlamak için gerekeni içermiyorsa bunu açıkça söyle ve hangi hesabın gerektiğini belirt.
- Belirsiz ifadeler yerine profildeki somut sayıları kullan.
- Sorunun ilgilendirdiği ölçüde gördüğün veri kalitesi sorunlarını belirt: eksik değerler, birkaç bozuk kayıt yüzünden metin olarak tiplenmiş sütunlar, şüpheli aralıklar.
- Kısa ve öz ol. Uzun bir makale değil, birkaç kısa paragraf veya kısa bir liste. Girizgâh yapma.`;

/** Renders the profile as compact text; JSON here spends tokens on syntax. */
function renderProfile(profile: Profile): string {
  const lines = [`Rows: ${profile.rowCount}`, `Columns: ${profile.columnCount}`, ""];

  for (const column of profile.columns) {
    const parts = [`- "${column.name}" (${column.kind})`];
    parts.push(`missing ${column.missing}`, `distinct ${column.distinct}`);

    if (column.stats) {
      const { min, max, mean, median, sum } = column.stats;
      parts.push(`min ${min}`, `max ${max}`, `mean ${mean}`, `median ${median}`, `sum ${sum}`);
    }
    if (column.range) {
      parts.push(`from ${column.range.earliest} to ${column.range.latest}`);
    }
    if (column.topValues?.length) {
      const top = column.topValues.map((v) => `${v.value} (${v.count})`).join(", ");
      parts.push(`most frequent: ${top}`);
    }
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

export function buildPrompt(request: AnalysisRequest): { system: string; user: string } {
  const system = request.language === "tr" ? SYSTEM_TR : SYSTEM_EN;

  const user = [
    `File: ${request.fileName}`,
    "",
    "## Dataset profile (computed over all rows)",
    renderProfile(request.profile),
    "",
    `## Sample rows (${request.sample.length} of ${request.profile.rowCount}, not representative of totals)`,
    JSON.stringify(request.sample, null, 1),
    "",
    "## Question",
    request.question.trim(),
  ].join("\n");

  return { system, user };
}

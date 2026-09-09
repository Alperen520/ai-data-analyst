/** Client for the local API server. Parses the SSE stream the server writes. */

import type { Row } from "./parse.ts";
import type { Profile } from "./profile.ts";

export interface AskOptions {
  fileName: string;
  question: string;
  profile: Profile;
  sample: Row[];
  language: "tr" | "en";
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

export interface AskResult {
  usage: { input: number; output: number; cacheRead: number };
  truncated: boolean;
}

export async function ask(options: AskOptions): Promise<AskResult> {
  const { onDelta, signal, ...payload } = options;

  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? `Request failed with status ${response.status}.`);
  }
  if (!response.body) throw new Error("The server returned an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AskResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const event = frame.match(/^event: (.+)$/m)?.[1];
      const data = frame.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) continue;

      const parsed = JSON.parse(data);
      if (event === "delta") onDelta(parsed.text);
      else if (event === "failed") throw new Error(parsed.error);
      else if (event === "done") result = parsed as AskResult;
    }
  }

  if (!result) throw new Error("The answer ended before it was complete.");
  return result;
}

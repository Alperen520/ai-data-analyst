/**
 * API server.
 *
 * This process is the only holder of the Anthropic key. The browser posts a
 * dataset profile and a question; the answer is streamed back over SSE. The key
 * is never sent to the client, and no dataset is written to disk.
 */

import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, type AnalysisRequest } from "./prompt.ts";

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

const app = express();
// Profiles of wide tables are a few hundred KB; the default 100kb limit rejects them.
app.use(express.json({ limit: "4mb" }));

const client = new Anthropic();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/ask", async (req, res) => {
  const body = req.body as Partial<AnalysisRequest>;

  if (!body?.question?.trim()) {
    res.status(400).json({ error: "A question is required." });
    return;
  }
  if (!body.profile || !Array.isArray(body.sample)) {
    res.status(400).json({ error: "A dataset profile and sample rows are required." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({
      error: "ANTHROPIC_API_KEY is not set on the server. Copy .env.example to .env and add your key.",
    });
    return;
  }

  // SSE: headers must be flushed before the first chunk or the browser buffers.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const { system, user } = buildPrompt(body as AnalysisRequest);

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      // The profile is identical for every question about a given file, so
      // caching it makes follow-up questions markedly cheaper.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });

    // If the user navigates away mid-answer, stop paying for the rest of it.
    // This watches the response, not the request: `req` emits "close" as soon as
    // its body has been read, which is before the answer has even started.
    res.on("close", () => {
      if (!res.writableEnded) stream.abort();
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send("delta", { text: event.delta.text });
      }
    }

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      send("failed", { error: "The model declined to answer this request." });
    } else {
      send("done", {
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cacheRead: message.usage.cache_read_input_tokens ?? 0,
        },
        truncated: message.stop_reason === "max_tokens",
      });
    }
  } catch (error) {
    send("failed", { error: describe(error) });
  } finally {
    res.end();
  }
});

/** Turns an SDK error into something a person reading the UI can act on. */
function describe(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The API key was rejected. Check ANTHROPIC_API_KEY in your .env file.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The request was rejected: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the API. Check your network connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `API error ${error.status ?? ""}: ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : "Unknown error.";
}

app.listen(PORT, () => {
  console.log(`API server on http://localhost:${PORT} (model: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY is not set - /api/ask will return 503 until it is.");
  }
});

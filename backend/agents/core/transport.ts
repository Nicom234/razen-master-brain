// Thin wrapper around Lovable's OpenAI-compatible /v1/chat/completions endpoint.
// Streams Server-Sent Events and yields decoded chunks.

import type { AgentMessage } from "./types.ts";

export type StreamChunk = {
  delta?: string;
  toolCall?: {
    id: string;
    name: string;
    argumentsDelta: string;
  };
  done?: boolean;
  raw?: unknown;
};

export type LovableStreamOpts = {
  apiKey: string;
  model: string;
  messages: AgentMessage[];
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } } | { type: "google_search" }>;
  reasoning?: "low" | "medium" | "high" | null;
  signal?: AbortSignal;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function* streamLovable(
  opts: LovableStreamOpts,
): AsyncGenerator<StreamChunk> {
  const body: Record<string, unknown> = {
    model: opts.model,
    stream: true,
    messages: opts.messages,
  };
  if (opts.reasoning) body.reasoning = { effort: opts.reasoning };
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;

  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new TransportError(`Lovable gateway ${resp.status}: ${detail.slice(0, 200)}`, resp.status);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          yield { done: true };
          return;
        }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta;
          if (typeof delta?.content === "string" && delta.content.length > 0) {
            yield { delta: delta.content, raw: parsed };
          }
          const tcs = delta?.tool_calls;
          if (Array.isArray(tcs)) {
            for (const tc of tcs) {
              yield {
                toolCall: {
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  argumentsDelta: tc.function?.arguments ?? "",
                },
                raw: parsed,
              };
            }
          }
        } catch {
          // partial JSON — re-buffer and wait for the next chunk
          buf = line + "\n" + buf;
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class TransportError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "TransportError";
  }
}

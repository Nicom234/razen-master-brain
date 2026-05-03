// Agent runtime — the orchestration loop.
//
// Mirrors the OpenClaw `Agent.run()` shape (event-stream output) but runs entirely
// inside an edge function. There's no gateway, no transport plugin, no remote
// session bookkeeping — Razen's runs are short-lived and stateless beyond Supabase.

import { makeEvent } from "./event-hub.ts";
import { composeSystemPrompt } from "./prompts.ts";
import { streamLovable, TransportError } from "./transport.ts";
import type {
  AgentEvent,
  AgentMessage,
  AgentRunInput,
  AgentRunResult,
  AgentSource,
} from "./types.ts";
import type { SkillRegistry } from "../skills/registry.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ToolContext } from "../tools/types.ts";

export type AgentRuntimeOpts = {
  skills: SkillRegistry;
  tools: ToolRegistry;
  apiKey: string;
  defaultModel: string;
  /** Cap on tool-call rounds per run — prevents infinite loops. */
  maxToolRounds?: number;
};

export class AgentRuntime {
  constructor(private opts: AgentRuntimeOpts) {}

  async *run(input: AgentRunInput, toolCtx: ToolContext): AsyncGenerator<AgentEvent, AgentRunResult> {
    const runId = crypto.randomUUID();
    const model = input.model ?? this.opts.defaultModel;

    yield makeEvent(runId, "run.started", { model, tier: input.tier });

    const skills = this.opts.skills.match(input);
    for (const s of skills) {
      yield makeEvent(runId, "skill.activated", { name: s.name });
    }

    const system = composeSystemPrompt({
      skills,
      memories: input.memories ?? [],
      tier: input.tier,
    });

    const allowedToolNames = new Set<string>();
    for (const s of skills) {
      for (const t of s.toolNames ?? []) allowedToolNames.add(t);
    }
    const fnTools = this.opts.tools.asOpenAI(allowedToolNames.size > 0 ? allowedToolNames : undefined);

    const gatewayTools: NonNullable<Parameters<typeof streamLovable>[0]["tools"]> = [...fnTools];
    if (input.useWebSearch && model.startsWith("google/")) {
      gatewayTools.push({ type: "google_search" });
    }

    const messages: AgentMessage[] = [
      { role: "system", content: system },
      ...input.messages,
    ];

    let acc = "";
    let rounds = 0;
    const maxRounds = this.opts.maxToolRounds ?? 4;

    try {
      while (rounds <= maxRounds) {
        rounds += 1;
        let roundText = "";
        const pendingToolCalls = new Map<string, { name: string; args: string }>();

        for await (const chunk of streamLovable({
          apiKey: this.opts.apiKey,
          model,
          messages,
          tools: gatewayTools.length > 0 ? gatewayTools : undefined,
          signal: input.signal,
        })) {
          if (chunk.delta) {
            roundText += chunk.delta;
            acc += chunk.delta;
            yield makeEvent(runId, "assistant.delta", { delta: chunk.delta });
          }
          if (chunk.toolCall) {
            const existing = pendingToolCalls.get(chunk.toolCall.id) ?? { name: "", args: "" };
            existing.name = existing.name || chunk.toolCall.name;
            existing.args += chunk.toolCall.argumentsDelta;
            pendingToolCalls.set(chunk.toolCall.id, existing);
          }
        }

        if (pendingToolCalls.size === 0) {
          if (roundText) {
            yield makeEvent(runId, "assistant.message", { content: roundText });
          }
          break;
        }

        // Execute tool calls and feed results back as messages.
        messages.push({
          role: "assistant",
          content: roundText,
        });

        for (const [id, call] of pendingToolCalls) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = call.args ? JSON.parse(call.args) : {};
          } catch {
            // tolerate malformed args by passing the raw string through
          }
          yield makeEvent(runId, "tool.call.started", { id, name: call.name, args: parsed });
          try {
            const out = await this.opts.tools.run(call.name, parsed, toolCtx);
            yield makeEvent(runId, "tool.call.completed", { id, name: call.name, output: out });
            messages.push({
              role: "tool",
              content: typeof out === "string" ? out : JSON.stringify(out),
              toolCallId: id,
              name: call.name,
            });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            yield makeEvent(runId, "tool.call.failed", { id, name: call.name, error: message });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: message }),
              toolCallId: id,
              name: call.name,
            });
          }
        }
      }

      const sources = extractSources(acc);
      for (const s of sources) yield makeEvent(runId, "source.found", s);
      yield makeEvent(runId, "run.completed", { text: acc });
      return { runId, status: "completed", text: acc, sources, model };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status = e instanceof TransportError ? e.status : 500;
      yield makeEvent(runId, "run.failed", { error: message, status });
      return { runId, status: "failed", text: acc, sources: [], model, error: message };
    }
  }
}

function extractSources(raw: string): AgentSource[] {
  const m = raw.match(/<<<SOURCES>>>([\s\S]*?)<<<END>>>/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.url === "string" && /^https?:\/\//.test(s.url))
      .map((s, i): AgentSource => ({
        n: typeof s.n === "number" ? s.n : i + 1,
        title: typeof s.title === "string" ? s.title : s.url,
        url: s.url,
        domain: typeof s.domain === "string" && s.domain ? s.domain : safeDomain(s.url),
      }));
  } catch {
    return [];
  }
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

# Razen Agents

A private, localized re-implementation of OpenClaw's agent-core architecture, adapted for Razen's Supabase + Lovable AI Gateway stack.

Lives outside `/src` so it can be imported by both the TanStack Start app **and** Supabase Edge Functions (Deno). No Node-only APIs.

## Three layers

```
┌──────────────────────────────────────────────────────────┐
│  Runtime  — orchestrates the agent loop, emits events    │
│  Skills   — markdown-style behaviour packs (when-to-use) │
│  Tools    — callable JSON-schema functions               │
└──────────────────────────────────────────────────────────┘
```

This mirrors the OpenClaw `packages/sdk` design (`Agent`, `Skill`, `Tool`, `EventHub`, `Transport`) but stripped to the surface area Razen actually needs.

## Layout

```
backend/agents/
├── core/        — runtime, event hub, transport, types
├── skills/      — manifest types + builtin skills
├── tools/       — registry, builtin tools
└── supabase/    — Supabase persistence + credit adapter
```

## Edge function

The matching Supabase edge function is `supabase/functions/agent/index.ts`. It imports this module directly via relative paths (Deno bundles whatever is reachable).

## Usage (server)

```ts
import { AgentRuntime, SkillRegistry, ToolRegistry, defaultSkills, defaultTools } from "../../backend/agents/index.ts";

const skills = new SkillRegistry();
defaultSkills.forEach((s) => skills.register(s));

const tools = new ToolRegistry();
defaultTools.forEach((t) => tools.register(t));

const runtime = new AgentRuntime({
  skills,
  tools,
  apiKey: Deno.env.get("LOVABLE_API_KEY")!,
  defaultModel: "google/gemini-3-flash-preview",
});

for await (const evt of runtime.run({ messages, userId, tier })) {
  // forward as SSE
}
```

## Why a copy and not a dependency

- OpenClaw is GPL-coupled and far larger than Razen needs.
- Supabase Edge Functions run Deno; the OpenClaw SDK targets Node.
- We only need the agent-loop + skill/tool primitives, not the full plugin/gateway/channel stack.

Keep this folder dependency-free. If you need a third-party package, add it through the edge function or the frontend, not here.

// Mirrors the discriminated event types from OpenClaw's `packages/sdk/src/types.ts`,
// trimmed to what Razen actually uses.

export type AgentEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "assistant.delta"
  | "assistant.message"
  | "tool.call.started"
  | "tool.call.completed"
  | "tool.call.failed"
  | "skill.activated"
  | "source.found";

export type AgentEvent<T = unknown> = {
  id: string;
  type: AgentEventType;
  ts: number;
  runId: string;
  data: T;
};

export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export type AgentMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type AgentMessage = {
  role: AgentMessageRole;
  content: AgentMessageContent;
  name?: string;
  toolCallId?: string;
};

export type AgentSource = {
  n: number;
  title: string;
  url: string;
  domain: string;
};

export type AgentTier = "free" | "pro" | "elite";

export type AgentRunInput = {
  messages: AgentMessage[];
  userId: string;
  tier: AgentTier;
  /** When true, attach the gateway's web-search tool. */
  useWebSearch?: boolean;
  /** Subset of skills to activate. If omitted, all matching skills run. */
  skillIds?: string[];
  /** Pre-loaded user memories to seed the system prompt. */
  memories?: string[];
  /** Override the default model. */
  model?: string;
  signal?: AbortSignal;
};

export type AgentRunResult = {
  runId: string;
  status: "completed" | "failed";
  text: string;
  sources: AgentSource[];
  model?: string;
  error?: string;
};

// Tools are JSON-Schema-described callables — the same shape OpenAI/Lovable expects
// for function-calling. Mirrors OpenClaw's `ToolInvokeParams` / `ToolInvokeResult`
// without the approvals/idempotency machinery (Razen runs are short-lived).

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolParameters = {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: readonly string[] | string[] }>;
  required?: string[];
};

export type ToolContext = {
  userId: string;
  tier: "free" | "pro" | "elite";
  /** Opaque Supabase admin client — typed loosely so this module stays Deno-agnostic. */
  supabase?: unknown;
  /** Per-run scratch space tools can share with each other. */
  scratch?: Record<string, unknown>;
};

export type Tool<TArgs extends Record<string, unknown> = Record<string, unknown>, TOut = unknown> = {
  name: string;
  description: string;
  parameters: ToolParameters;
  /** Run the tool. Throw to signal failure. */
  execute: (args: TArgs, ctx: ToolContext) => Promise<TOut>;
};

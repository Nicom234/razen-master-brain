// Skill manifests are the localized equivalent of OpenClaw's `SKILL.md` files.
// Each skill describes a behaviour pack: when to activate, what to do, what tools it owns.
//
// Unlike OpenClaw we don't parse YAML at runtime; skills are TypeScript objects so the
// edge function bundles them directly.

import type { AgentRunInput } from "../core/types.ts";

export type SkillManifest = {
  /** Stable identifier — kebab-case. */
  name: string;
  /** One-sentence description shown to the model. */
  description: string;
  /** Bullet phrases — when this skill applies. */
  whenToUse: string[];
  /** Bullet phrases — when this skill should NOT activate. */
  whenNotToUse: string[];
  /** Optional addendum spliced into the system prompt when active. */
  systemPrompt?: string;
  /** Tool names this skill is allowed to call. Empty = no tool gating. */
  toolNames?: string[];
  /** Predicate for auto-activation. If omitted, the skill is always active. */
  match?: (input: AgentRunInput) => boolean;
  /** Display metadata. */
  emoji?: string;
};

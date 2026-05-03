import type { SkillManifest } from "./types.ts";

// Five default skills. Each maps roughly to one of OpenClaw's `skills/*/SKILL.md`
// files but distilled to behaviour Razen actually exposes.

const webResearch: SkillManifest = {
  name: "web-research",
  emoji: "🔎",
  description: "Cite real-time web sources when answering factual or current-events questions.",
  whenToUse: [
    "User asks about current events, prices, releases, or anything recent",
    "User asks 'what is X' for a specific company, product, paper, or person",
    "User asks for comparisons between named tools, products, or services",
  ],
  whenNotToUse: [
    "Pure code, math, or creative writing",
    "Personal life advice, brainstorming, or opinion",
    "Anything the user has already given you the facts for",
  ],
  systemPrompt:
    "When this skill is active and web search is enabled, ground every non-obvious factual claim with [n] citations and emit the SOURCES manifest at the end.",
  match: (input) => Boolean(input.useWebSearch),
};

const memoryRecall: SkillManifest = {
  name: "memory-recall",
  emoji: "🧠",
  description: "Use stored user memories to personalise replies without reciting them.",
  whenToUse: [
    "The user references something Razen should already know",
    "The user is mid-project and context would help",
  ],
  whenNotToUse: [
    "Free-tier users (no memories stored)",
    "Generic factual questions where personalisation adds noise",
  ],
  toolNames: ["recall_memory"],
  match: (input) => input.tier !== "free" && (input.memories?.length ?? 0) > 0,
};

const codingAssist: SkillManifest = {
  name: "coding-assist",
  emoji: "💻",
  description: "Write, debug, and explain production-quality code in any language.",
  whenToUse: [
    "User asks to write, fix, or explain code",
    "User pastes a stack trace, error, or snippet",
    "User asks about an API, library, or framework",
  ],
  whenNotToUse: [
    "Pure prose tasks",
    "Decisions that should happen before any code is written",
  ],
  systemPrompt:
    "Default to runnable, idiomatic code. Use the right language for the task. Add a one-line comment only when the *why* is non-obvious. Show full files only when asked.",
};

const writingAssist: SkillManifest = {
  name: "writing-assist",
  emoji: "✍️",
  description: "Editorial-grade drafting, polishing, and rewriting.",
  whenToUse: [
    "Drafting emails, posts, copy, essays, or scripts",
    "Polishing or rewriting prose the user pasted",
    "Asking for a specific voice, tone, or audience",
  ],
  whenNotToUse: [
    "Asking factual questions about real-world events",
    "Asking for code or data",
  ],
  systemPrompt:
    "Match the user's target register exactly. Prefer precise modern language over generic marketing fluff. Return polished output, not process notes.",
};

const calc: SkillManifest = {
  name: "calculator",
  emoji: "🧮",
  description: "Run arithmetic and unit-conversion via the calculator tool for exact results.",
  whenToUse: [
    "Any non-trivial arithmetic, percentages, currency, or unit conversion",
    "Anywhere a wrong number would damage the answer",
  ],
  whenNotToUse: [
    "Trivial mental math (2+2)",
    "Symbolic algebra or proofs",
  ],
  toolNames: ["calculate"],
};

export const defaultSkills: SkillManifest[] = [
  webResearch,
  memoryRecall,
  codingAssist,
  writingAssist,
  calc,
];

import type { SkillManifest } from "./types.ts";

// Workspace Assistant skills.
//
// Each skill describes a class of everyday work the assistant can take ownership of.
// Skills marked `requiresConnection` only auto-activate once the user has linked
// the underlying integration; otherwise the assistant explains how to connect it.
//
// The skill manifests intentionally describe behaviour, not OAuth wiring — the
// per-integration auth lives in `supabase/functions/integrations-*` (to be added
// per provider) and is gated by the `connections` table.

const inboxTriage: SkillManifest = {
  name: "inbox-triage",
  emoji: "📥",
  description: "Triage email — summarise threads, draft replies, surface what actually needs the user.",
  whenToUse: [
    "User asks about their email, unread, inbox, or a sender",
    "User wants drafts for replies or follow-ups",
    "User wants a daily/weekly inbox digest",
  ],
  whenNotToUse: [
    "Cold outreach to people the user has never met",
    "Bulk send / merge — always confirm before sending more than one email",
  ],
  systemPrompt:
    "For each thread, give a one-line read of the ask, then either a recommended action or a draft reply. Default to drafting; only send if the user said go.",
  toolNames: ["list_emails", "draft_email", "send_email"],
};

const calendarOps: SkillManifest = {
  name: "calendar-ops",
  emoji: "🗓️",
  description: "Read, plan, and schedule — find time, draft invites, prep briefings before meetings.",
  whenToUse: [
    "User asks about their calendar, today, this week, free time, or scheduling",
    "User wants a meeting prepped, summarised, or rescheduled",
  ],
  whenNotToUse: [
    "Booking restaurants / flights / hotels — those are external",
  ],
  systemPrompt:
    "Always show the time in the user's timezone. When proposing slots, give 2–3 options, not a wall of times.",
  toolNames: ["list_events", "find_free_time", "create_event"],
};

const slackChannel: SkillManifest = {
  name: "slack-channel",
  emoji: "💬",
  description: "Summarise channels and DMs, draft messages, surface threads that mention the user.",
  whenToUse: [
    "User asks 'what did I miss', 'catch me up on #channel', or wants a Slack digest",
    "User wants a message drafted in a specific channel's tone",
  ],
  whenNotToUse: [
    "Mass DMs — always confirm before sending to more than one person",
  ],
  toolNames: ["slack_summarise", "slack_draft", "slack_send"],
};

const notionDocs: SkillManifest = {
  name: "notion-docs",
  emoji: "📝",
  description: "Read, draft, and update Notion pages — PRDs, meeting notes, weekly updates.",
  whenToUse: [
    "User asks for a doc, PRD, brief, or weekly update",
    "User wants to update or extend an existing Notion page",
  ],
  whenNotToUse: [
    "Casual scratchpad notes — keep those in chat unless the user asks to file them",
  ],
  toolNames: ["notion_search", "notion_read", "notion_create", "notion_update"],
};

const linearTickets: SkillManifest = {
  name: "linear-tickets",
  emoji: "🔄",
  description: "File, update, and triage Linear issues. Group bugs, link PRs, set sensible priority.",
  whenToUse: [
    "User describes a bug, task, or feature in a way that should be tracked",
    "User asks about ticket status or sprint progress",
  ],
  whenNotToUse: [
    "Pure brainstorming — don't file ideas as tickets unless the user asks",
  ],
  toolNames: ["linear_create", "linear_search", "linear_update"],
};

const githubOps: SkillManifest = {
  name: "github-ops",
  emoji: "🐙",
  description: "Read PRs, summarise diffs, draft review comments, open issues.",
  whenToUse: [
    "User asks about a PR, repo, issue, or wants a code summary",
    "User wants help replying to a code review",
  ],
  whenNotToUse: [
    "Writing brand-new production code — use the Build mode for that",
  ],
  toolNames: ["github_pr_read", "github_pr_comment", "github_issue_create"],
};

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
  inboxTriage,
  calendarOps,
  slackChannel,
  notionDocs,
  linearTickets,
  githubOps,
  webResearch,
  memoryRecall,
  calc,
];

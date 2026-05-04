import type { SkillManifest } from "./types.ts";

const inboxTriage: SkillManifest = {
  name: "inbox-triage",
  emoji: "📥",
  description: "Triage Gmail — summarise threads, draft replies, surface what needs the user.",
  whenToUse: [
    "User asks about email, unread messages, inbox, or a sender",
    "User wants drafts for replies or follow-ups",
    "User wants a daily/weekly inbox digest",
  ],
  whenNotToUse: [
    "Cold outreach to people the user has never met",
    "Bulk send — always confirm before sending more than one email",
  ],
  systemPrompt: "For each thread give a one-line read of the ask, then either a recommended action or a draft reply. Default to drafting; only send if the user said go.",
  toolNames: ["list_emails", "draft_email", "send_email"],
};

const outlookTriage: SkillManifest = {
  name: "outlook-triage",
  emoji: "📨",
  description: "Triage Microsoft Outlook — summarise, draft replies, surface priority emails.",
  whenToUse: [
    "User asks about Outlook, Microsoft email, or Office 365 mail",
    "User is on a Microsoft/enterprise stack and asks about inbox",
  ],
  whenNotToUse: ["Bulk send — always confirm first"],
  systemPrompt: "Draft replies by default; never send without explicit go-ahead.",
  toolNames: ["list_outlook_emails", "draft_outlook_email", "send_outlook_email"],
};

const calendarOps: SkillManifest = {
  name: "calendar-ops",
  emoji: "🗓️",
  description: "Read, plan, and schedule via Google Calendar — find time, draft invites, prep briefings.",
  whenToUse: [
    "User asks about calendar, today, this week, free time, or scheduling",
    "User wants a meeting prepped, summarised, or rescheduled",
  ],
  whenNotToUse: ["Booking restaurants/flights — those are external"],
  systemPrompt: "Always show times in the user's timezone. Offer 2–3 slot options, not a wall of times.",
  toolNames: ["list_events", "find_free_time", "create_event"],
};

const slackChannel: SkillManifest = {
  name: "slack-channel",
  emoji: "💬",
  description: "Summarise Slack channels, draft messages, surface threads mentioning the user.",
  whenToUse: [
    "User asks 'what did I miss', 'catch me up on #channel', or wants a Slack digest",
    "User wants a message drafted in a specific channel's tone",
  ],
  whenNotToUse: ["Mass DMs — always confirm before sending to more than one person"],
  toolNames: ["slack_summarise", "slack_draft", "slack_send"],
};

const teamsChannel: SkillManifest = {
  name: "teams-channel",
  emoji: "🟦",
  description: "Summarise Microsoft Teams chats and send messages.",
  whenToUse: [
    "User asks about Teams, Microsoft chat, or a specific Teams conversation",
    "User is on a Microsoft-stack team and asks about messages",
  ],
  whenNotToUse: ["Always confirm before sending a Teams message"],
  toolNames: ["teams_summarise", "teams_send"],
};

const notionDocs: SkillManifest = {
  name: "notion-docs",
  emoji: "📝",
  description: "Read, draft, and update Notion pages — PRDs, meeting notes, weekly updates.",
  whenToUse: [
    "User asks for a doc, PRD, brief, or weekly update",
    "User wants to update or extend an existing Notion page",
  ],
  whenNotToUse: ["Casual scratchpad notes — keep in chat unless the user asks to file them"],
  toolNames: ["notion_search", "notion_read", "notion_create", "notion_update"],
};

const linearTickets: SkillManifest = {
  name: "linear-tickets",
  emoji: "🔄",
  description: "File, update, and triage Linear issues — bugs, features, sprint tracking.",
  whenToUse: [
    "User describes a bug, task, or feature that should be tracked",
    "User asks about ticket status or sprint progress",
  ],
  whenNotToUse: ["Pure brainstorming — don't file ideas as tickets unless asked"],
  toolNames: ["linear_create", "linear_search", "linear_update"],
};

const jiraOps: SkillManifest = {
  name: "jira-ops",
  emoji: "🔵",
  description: "Search, create, and update Jira issues with JQL.",
  whenToUse: [
    "User mentions Jira, tickets, sprint, backlog, or epics",
    "User's team uses Jira as their issue tracker",
  ],
  whenNotToUse: ["Never create issues without explicit go-ahead"],
  toolNames: ["jira_search", "jira_create", "jira_update"],
};

const asanaOps: SkillManifest = {
  name: "asana-ops",
  emoji: "🌸",
  description: "List, create, and update Asana tasks and projects.",
  whenToUse: [
    "User mentions Asana, tasks, or project boards",
    "User wants to see or manage their to-do list in Asana",
  ],
  whenNotToUse: ["Don't create tasks without user confirmation"],
  toolNames: ["asana_list_tasks", "asana_create_task", "asana_update_task"],
};

const githubOps: SkillManifest = {
  name: "github-ops",
  emoji: "🐙",
  description: "Read PRs, summarise diffs, draft review comments, open issues.",
  whenToUse: [
    "User asks about a PR, repo, issue, or wants a code summary",
    "User wants help replying to a code review",
  ],
  whenNotToUse: ["Writing brand-new production code — use Build mode for that"],
  toolNames: ["github_pr_read", "github_pr_comment", "github_issue_create"],
};

const driveOps: SkillManifest = {
  name: "drive-ops",
  emoji: "📂",
  description: "Search, read, and create Google Drive documents.",
  whenToUse: [
    "User asks to find, read, or create a Google Doc or Drive file",
    "User wants to write a document and save it to Drive",
  ],
  whenNotToUse: ["Don't create files without user confirmation"],
  toolNames: ["drive_search", "drive_read", "drive_create"],
};

const crmOps: SkillManifest = {
  name: "crm-ops",
  emoji: "🤝",
  description: "Search HubSpot contacts and deals, add contacts.",
  whenToUse: [
    "User asks about a customer, lead, contact, or deal",
    "User wants to look up or add someone in HubSpot",
  ],
  whenNotToUse: ["Always confirm before creating or modifying CRM records"],
  toolNames: ["hubspot_search_contacts", "hubspot_create_contact", "hubspot_search_deals"],
};

const meetingsOps: SkillManifest = {
  name: "meetings-ops",
  emoji: "📹",
  description: "List upcoming Zoom meetings and schedule new ones.",
  whenToUse: [
    "User asks about a Zoom meeting, video call, or wants to schedule one",
  ],
  whenNotToUse: ["Don't schedule without explicit user confirmation"],
  toolNames: ["zoom_list_meetings", "zoom_create_meeting"],
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
  systemPrompt: "When this skill is active and web search is enabled, ground every non-obvious factual claim with [n] citations and emit the SOURCES manifest at the end.",
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
  whenNotToUse: ["Trivial mental math (2+2)", "Symbolic algebra or proofs"],
  toolNames: ["calculate"],
};

export const defaultSkills: SkillManifest[] = [
  inboxTriage,
  outlookTriage,
  calendarOps,
  slackChannel,
  teamsChannel,
  notionDocs,
  linearTickets,
  jiraOps,
  asanaOps,
  githubOps,
  driveOps,
  crmOps,
  meetingsOps,
  webResearch,
  memoryRecall,
  calc,
];

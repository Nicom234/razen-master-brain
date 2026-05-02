// Research Lab — a deep-research workspace inspired by Grok Heavy / Claude Opus
// Research / GPT Pro Deep Research / Perplexity Pro / Manus.
//
// Architecture:
//   1. User states a question.
//   2. We ask the model to plan: decompose into 4-8 parallel sub-questions,
//      pick a depth level, and propose a structure for the final report.
//   3. User approves/edits the plan (or runs it as-is).
//   4. We run sub-questions in parallel via the chat function with web search,
//      collecting cited sources into a Source Bench.
//   5. We synthesize a long-form report with inline citations and a
//      "what's still uncertain" section.
//
// Persisted to localStorage so users can return to past investigations.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BookOpen, Beaker, Brain, Check, ChevronDown, ChevronRight,
  Download, FileText, Globe, Layers, Loader2, Plus, RefreshCw, Search,
  Sparkles, Trash2, Zap, AlertCircle, ListChecks, Quote, MessageSquare, Crown,
  Activity, Compass, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const STORE_KEY = "razen.research.lab.v1";

type Depth = 1 | 2 | 3 | 4 | 5;
type SubStatus = "pending" | "running" | "done" | "error";
type Source = { title: string; url: string; snippet?: string; subId?: string };
type SubQuestion = {
  id: string;
  question: string;
  angle?: string; // why this question matters
  status: SubStatus;
  answer?: string;
  sources: Source[];
  startedAt?: number;
  finishedAt?: number;
};
type Plan = {
  thesis: string;        // the framing question, sharpened
  hypotheses: string[];  // working hypotheses to test
  sections: string[];    // proposed report sections
  contrarian: string;    // what would change our mind
};
type ActivityKind = "info" | "plan" | "search" | "found" | "synthesize" | "quick" | "error";
type ActivityEvent = { ts: number; kind: ActivityKind; msg: string; meta?: string };
type FollowUp = { question: string; angle: string };
type Investigation = {
  id: string;
  query: string;
  depth: Depth;
  createdAt: number;
  updatedAt: number;
  plan?: Plan;
  subs: SubQuestion[];
  report?: string;
  notes: string;
  quickAnswer?: string;       // direct answer for non-research-grade questions
  quickSources?: Source[];    // sources for the quick answer
  isQuick?: boolean;          // marks this as a quick answer (not full lab)
  activity: ActivityEvent[];  // chronological log of agent activity
  followUps?: FollowUp[];     // AI-suggested next questions
};

const DEPTH_LABELS: Record<Depth, { label: string; subs: string; tokens: string; tone: string }> = {
  1: { label: "Quick scan",    subs: "3 sub-questions",  tokens: "~1k words",  tone: "fast brief" },
  2: { label: "Standard",      subs: "5 sub-questions",  tokens: "~2k words",  tone: "balanced" },
  3: { label: "Deep",          subs: "6 sub-questions",  tokens: "~3.5k words", tone: "investigative" },
  4: { label: "Expert",        subs: "7 sub-questions",  tokens: "~5k words",  tone: "analyst-grade" },
  5: { label: "Heavy",         subs: "8 sub-questions",  tokens: "~7k words",  tone: "lab-grade, contrarian" },
};
const DEPTH_TARGETS: Record<Depth, number> = { 1: 3, 2: 5, 3: 6, 4: 7, 5: 8 };

// Heuristic triage: is this a research question or a conversational/advice question?
// Quick answer = personal, advice-seeking, opinion, short factual, conversational.
// Lab = comparative analysis, "what is the landscape", "how do X think about Y", multi-source.
function classifyQuery(q: string): "quick" | "lab" {
  const t = q.trim().toLowerCase();
  if (t.length < 30) return "quick";
  // Conversational / advice / personal pronouns
  if (/^(should i|can i|how do i|what should i|help me|tell me|give me|recommend|suggest|advice|what'?s the best)/.test(t)) return "quick";
  if (/\b(my|i'm|i am|i've|for me|for my)\b/.test(t)) return "quick";
  // Lab signals: compare, analyse, landscape, evidence, sources, deep
  if (/\b(compare|landscape|analy[sz]e|evidence|sources?|state of|literature|systematic|meta[- ]analysis|deep dive|investigate|across|trends?|what do experts|what does the research|cited)\b/.test(t)) return "lab";
  // Question opener that suggests research
  if (/^(what are the|why does|why do|why is|how does|how do|to what extent|under what conditions)/.test(t)) return "lab";
  return "quick";
}

interface ResearchLabProps {
  onCreditsChange: (credits: number | null) => void;
  onExitResearch: () => void;
  tier?: "free" | "pro" | "elite";
  selectedId?: string | null;
  onRefresh?: () => void;
}


// ---------- persistence ----------
function loadStore(): Record<string, Investigation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveStore(s: Record<string, Investigation>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}
function newInvestigation(query = ""): Investigation {
  return {
    id: crypto.randomUUID(),
    query, depth: 3, createdAt: Date.now(), updatedAt: Date.now(),
    subs: [], notes: "", activity: [],
  };
}

// ---------- model calls ----------
async function callChat(messages: { role: string; content: string }[], useWebSearch: boolean): Promise<{ content: string; credits: number | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ messages, mode: "research", useWebSearch }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  const credHeader = res.headers.get("X-Credits-Remaining");
  const credits = credHeader ? Number(credHeader) : null;

  // The chat function streams SSE. Collect the whole thing.
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta?.content;
        if (typeof delta === "string") content += delta;
      } catch { /* skip */ }
    }
  }
  return { content, credits };
}

function parsePlan(text: string, depth: Depth): { plan: Plan; subs: SubQuestion[] } | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
      thesis?: string; hypotheses?: string[]; sections?: string[]; contrarian?: string;
      subQuestions?: { question?: string; angle?: string }[];
    };
    const target = DEPTH_TARGETS[depth];
    const rawSubs = Array.isArray(obj.subQuestions) ? obj.subQuestions.slice(0, target) : [];
    const subs: SubQuestion[] = rawSubs.map((s) => ({
      id: crypto.randomUUID(),
      question: String(s.question ?? "Untitled"),
      angle: s.angle ? String(s.angle) : undefined,
      status: "pending",
      sources: [],
    }));
    return {
      plan: {
        thesis: String(obj.thesis ?? ""),
        hypotheses: Array.isArray(obj.hypotheses) ? obj.hypotheses.map(String) : [],
        sections: Array.isArray(obj.sections) ? obj.sections.map(String) : [],
        contrarian: String(obj.contrarian ?? ""),
      },
      subs,
    };
  } catch { return null; }
}

// Pull URLs out of a markdown answer to populate the source bench.
function extractSources(answer: string, subId: string): Source[] {
  const out: Source[] = [];
  // Markdown links: [title](url)
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(answer)) !== null) {
    out.push({ title: m[1], url: m[2], subId });
  }
  // Bare URLs not already captured
  const seen = new Set(out.map((s) => s.url));
  const bare = /https?:\/\/[^\s)\]]+/g;
  while ((m = bare.exec(answer)) !== null) {
    if (!seen.has(m[0])) { out.push({ title: new URL(m[0]).hostname, url: m[0], subId }); seen.add(m[0]); }
  }
  return out.slice(0, 8);
}

function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000); const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function ResearchLab({ onCreditsChange, onExitResearch, tier = "free", selectedId, onRefresh }: ResearchLabProps) {
  const [store, setStore] = useState<Record<string, Investigation>>(() => loadStore());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const s = loadStore();
    const ids = Object.keys(s).sort((a, b) => s[b].updatedAt - s[a].updatedAt);
    return ids[0] ?? null;
  });
  const [input, setInput] = useState("");
  const [depth, setDepth] = useState<Depth>(3);
  const [phase, setPhase] = useState<"idle" | "triage" | "quick" | "planning" | "investigating" | "synthesizing">("idle");
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<"plan" | "subs" | "sources" | "report" | "activity" | "notes">("plan");
  const reportRef = useRef<HTMLDivElement>(null);

  const active = activeId ? store[activeId] : null;

  useEffect(() => { saveStore(store); }, [store]);
  useEffect(() => {
    if (phase === "idle") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  // First-launch default
  useEffect(() => {
    if (Object.keys(store).length === 0) {
      const inv = newInvestigation();
      setStore({ [inv.id]: inv });
      setActiveId(inv.id);
    }
  }, [store]);

  // Sync with parent-selected session (from app.tsx sidebar).
  useEffect(() => {
    if (selectedId === null) {
      // "New" clicked in parent sidebar → create fresh
      createInvestigation();
    } else if (selectedId && selectedId !== activeId && store[selectedId]) {
      setActiveId(selectedId);
      setTab("plan");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const updateActive = (mut: (i: Investigation) => Investigation) => {
    if (!activeId) return;
    setStore((s) => {
      const cur = s[activeId]; if (!cur) return s;
      return { ...s, [activeId]: { ...mut(cur), updatedAt: Date.now() } };
    });
  };
  const pushActivity = (kind: ActivityKind, msg: string, meta?: string) => {
    updateActive((i) => ({ ...i, activity: [...(i.activity || []), { ts: Date.now(), kind, msg, meta }] }));
  };

  const createInvestigation = () => {
    const inv = newInvestigation();
    setStore((s) => ({ ...s, [inv.id]: inv }));
    setActiveId(inv.id);
    setInput(""); setTab("plan"); setPhase("idle");
    setTimeout(() => onRefresh?.(), 100);
  };

  const deleteInvestigation = (id: string) => {
    setStore((s) => { const n = { ...s }; delete n[id]; return n; });
    if (activeId === id) {
      const remaining = Object.keys(store).filter((k) => k !== id);
      setActiveId(remaining[0] ?? null);
    }
    setTimeout(() => onRefresh?.(), 100);
  };

  const allSources = useMemo<Source[]>(() => {
    if (!active) return [];
    const out: Source[] = [];
    const seen = new Set<string>();
    for (const sub of active.subs) {
      for (const src of sub.sources) {
        if (seen.has(src.url)) continue;
        seen.add(src.url); out.push(src);
      }
    }
    return out;
  }, [active]);

  // ---- 1. Build a research plan ----
  const runPlanning = async () => {
    if (!active || !input.trim()) return;
    const query = input.trim();
    setPhase("planning"); setTab("plan");
    updateActive((i) => ({ ...i, query, depth, plan: undefined, subs: [], report: undefined, activity: [], followUps: undefined }));
    pushActivity("plan", `Drafting investigation plan at ${DEPTH_LABELS[depth].label} depth`, query);

    const target = DEPTH_TARGETS[depth];
    const sys = `You are Razen Research — Lab mode. The user posed a research question. You must produce a rigorous investigation plan.

Return ONLY valid JSON (no prose, no fences) matching:
{
  "thesis": "the question reframed as a precise, testable thesis",
  "hypotheses": ["competing hypothesis 1", "competing hypothesis 2", "..."],
  "subQuestions": [
    { "question": "atomic sub-question (web-searchable, specific)", "angle": "why this matters / what it tests" }
  ],
  "sections": ["Section title for the final report", "..."],
  "contrarian": "what evidence would force us to reverse the conclusion"
}

Rules:
- Produce exactly ${target} subQuestions. Each must be parallelizable, narrow, and answerable from public sources.
- 3-5 hypotheses spanning the realistic answer space (don't strawman).
- 5-8 report sections, structured for a serious analyst memo (Executive Summary, Background, Findings, Counter-Evidence, Implications, Open Questions).
- "contrarian" must name SPECIFIC evidence types, not platitudes.
- No filler, no generic advice. Be opinionated and precise.`;

    try {
      const { content, credits } = await callChat(
        [{ role: "system", content: sys }, { role: "user", content: query }],
        false,
      );
      onCreditsChange(credits);
      const parsed = parsePlan(content, depth);
      if (!parsed) { pushActivity("error", "Couldn't parse plan — model returned malformed JSON"); toast.error("Couldn't parse the plan — try rephrasing"); setPhase("idle"); return; }
      updateActive((i) => ({ ...i, plan: parsed.plan, subs: parsed.subs }));
      pushActivity("info", `Plan ready: ${parsed.subs.length} sub-questions, ${parsed.plan.hypotheses.length} hypotheses`, parsed.plan.thesis);
      setTab("plan");
      toast.success(`Plan ready — ${parsed.subs.length} sub-questions`);
    } catch (e) {
      pushActivity("error", e instanceof Error ? e.message : "Planning failed");
      toast.error(e instanceof Error ? e.message : "Planning failed");
    } finally { setPhase("idle"); }
  };

  // ---- 2. Run all sub-questions in parallel ----
  const runInvestigation = async () => {
    if (!active || active.subs.length === 0) { toast.error("No sub-questions yet — run Plan first"); return; }
    setPhase("investigating"); setTab("subs");
    // Reset all subs to pending
    updateActive((i) => ({ ...i, subs: i.subs.map((s) => ({ ...s, status: "pending", answer: undefined, sources: [], startedAt: undefined, finishedAt: undefined })) }));

    const subs = active.subs;
    pushActivity("info", `Running ${subs.length} sub-questions in parallel`, `Concurrency 3, web search on`);
    const sys = `You are a research analyst. Answer the sub-question concisely (300-500 words) using web search. Inline-cite every factual claim with [Title](url) markdown links. End with a 1-line "Confidence: high/medium/low — because ...".`;

    // Run in parallel, but cap concurrency so we don't blow rate limits.
    const concurrency = 3;
    let cursor = 0;
    const runOne = async (sub: SubQuestion) => {
      updateActive((i) => ({ ...i, subs: i.subs.map((s) => s.id === sub.id ? { ...s, status: "running", startedAt: Date.now() } : s) }));
      pushActivity("search", `Searching: ${sub.question}`, sub.angle);
      try {
        const { content, credits } = await callChat(
          [{ role: "system", content: sys }, { role: "user", content: `Question: ${sub.question}\n\nContext / why we care: ${sub.angle ?? "n/a"}\n\nQuery for the broader investigation: ${active.query}` }],
          true,
        );
        if (credits !== null) onCreditsChange(credits);
        const sources = extractSources(content, sub.id);
        updateActive((i) => ({ ...i, subs: i.subs.map((s) => s.id === sub.id ? { ...s, status: "done", answer: content, sources, finishedAt: Date.now() } : s) }));
        pushActivity("found", `${sub.question.slice(0, 80)}${sub.question.length > 80 ? "…" : ""}`, `${sources.length} source${sources.length === 1 ? "" : "s"}`);
      } catch (e) {
        updateActive((i) => ({ ...i, subs: i.subs.map((s) => s.id === sub.id ? { ...s, status: "error", answer: e instanceof Error ? e.message : "Failed", finishedAt: Date.now() } : s) }));
        pushActivity("error", `Failed: ${sub.question.slice(0, 60)}`, e instanceof Error ? e.message : undefined);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, subs.length) }, async () => {
      while (cursor < subs.length) {
        const idx = cursor++;
        await runOne(subs[idx]);
      }
    });
    await Promise.all(workers);
    pushActivity("info", "Investigation complete", `${subs.length} sub-questions resolved`);
    setPhase("idle");
    toast.success("Investigation complete — synthesize the report next");
  };

  // ---- 3. Synthesize final report ----
  const runSynthesis = async () => {
    if (!active || !active.plan || active.subs.some((s) => s.status !== "done" && s.status !== "error")) {
      toast.error("Run the investigation first"); return;
    }
    setPhase("synthesizing"); setTab("report");
    pushActivity("synthesize", "Synthesizing analyst memo", `${active.subs.length} sub-questions, depth ${DEPTH_LABELS[active.depth].label}`);
    const findings = active.subs.map((s, i) => `### Sub-question ${i + 1}: ${s.question}\n\n${s.answer ?? "(no answer)"}\n`).join("\n---\n");
    const depthInfo = DEPTH_LABELS[active.depth];
    const sys = `You are Razen Research — synthesizing a final analyst memo at ${depthInfo.label} depth (${depthInfo.tokens}, tone: ${depthInfo.tone}).

Use the sub-question findings below to write a long-form, well-structured report.

Required structure:
${active.plan.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Rules:
- Inline-cite with [Title](url) markdown links pulled from the findings — every factual claim must have a citation.
- Do NOT just summarize — synthesize. Identify agreement, disagreement, gaps.
- Address the contrarian test: "${active.plan.contrarian}". State whether it triggered.
- End with two sections: "What's still uncertain" (bullet list of open questions) and "Recommended next steps" (3-5 concrete actions).
- Use ## for sections, ### for subsections, **bold** for key claims.
- Be opinionated. No mealy-mouthed hedging.`;

    try {
      const { content, credits } = await callChat(
        [{ role: "system", content: sys }, { role: "user", content: `Original question: ${active.query}\n\nThesis: ${active.plan.thesis}\n\nHypotheses tested:\n- ${active.plan.hypotheses.join("\n- ")}\n\nFindings:\n\n${findings}` }],
        false,
      );
      if (credits !== null) onCreditsChange(credits);
      updateActive((i) => ({ ...i, report: content }));
      pushActivity("info", "Report synthesized", `${content.length.toLocaleString()} chars`);
      toast.success("Report synthesized");
      setTimeout(() => reportRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
    } catch (e) {
      pushActivity("error", e instanceof Error ? e.message : "Synthesis failed");
      toast.error(e instanceof Error ? e.message : "Synthesis failed");
    } finally { setPhase("idle"); }
  };

  // Suggest follow-ups: a separate quick call from the live report+findings
  // returning a JSON array of { question, angle } so we can render clickable
  // chips that spawn a new investigation.
  const runFollowUps = async () => {
    if (!active?.report) return;
    pushActivity("info", "Suggesting follow-ups");
    const sys = `You are Razen Research. Read the analyst memo and propose 4 strong follow-up investigations the team should run next. Each should target a real gap, contradiction, or implication exposed by the memo.

Return ONLY valid JSON (no fences, no prose):
{ "followUps": [ { "question": "the next research question", "angle": "why this matters / what it would unlock" } ] }`;
    try {
      const { content, credits } = await callChat(
        [{ role: "system", content: sys }, { role: "user", content: `Original question: ${active.query}\n\nMemo:\n\n${active.report}` }],
        false,
      );
      if (credits !== null) onCreditsChange(credits);
      const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) { toast.error("Couldn't parse follow-ups"); return; }
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as { followUps?: Array<{ question?: string; angle?: string }> };
      const items = (obj.followUps ?? []).filter((f) => f.question).map((f) => ({ question: String(f.question), angle: String(f.angle ?? "") }));
      updateActive((i) => ({ ...i, followUps: items }));
      pushActivity("info", `${items.length} follow-ups suggested`);
      toast.success("Follow-ups ready");
    } catch (e) {
      pushActivity("error", e instanceof Error ? e.message : "Follow-up generation failed");
      toast.error("Follow-up generation failed");
    }
  };

  const startFollowUp = (q: string) => {
    const inv = newInvestigation(q);
    setStore((s) => ({ ...s, [inv.id]: inv }));
    setActiveId(inv.id);
    setInput(q); setTab("plan"); setPhase("idle");
  };

  const runFullPipeline = async () => {
    if (!input.trim()) return;
    await runPlanning();
    // chained inside next tick after state propagation
    setTimeout(async () => {
      await runInvestigation();
      setTimeout(() => { void runSynthesis(); }, 300);
    }, 300);
  };

  // Quick answer — for advice / conversational / narrow factual questions.
  // No planning, no sub-questions, no synthesis. Just a direct, well-cited reply.
  const runQuick = async () => {
    if (!active || !input.trim()) return;
    const query = input.trim();
    setPhase("quick"); setTab("report");
    updateActive((i) => ({
      ...i, query, isQuick: true,
      plan: undefined, subs: [], report: undefined,
      quickAnswer: "", quickSources: [], activity: [], followUps: undefined,
    }));
    pushActivity("quick", "Quick answer mode", query);
    const sys = `You are Razen Research — Quick Answer mode. The user asked a focused question that doesn't need a full multi-source investigation. Give a direct, opinionated, useful answer.

Rules:
- Lead with the answer in the first 1-2 sentences. No preamble.
- 200-500 words. Use markdown — short paragraphs, bullets where helpful, **bold** for the key claim.
- If the question is advice / personal, give specific, actionable guidance. Don't ask clarifying questions unless absolutely necessary — make a smart default assumption and call it out.
- If it's factual, cite sources inline as [Title](url) markdown links — but only when you actually used them.
- End with one short "If you want to go deeper:" line suggesting what a full Lab investigation could uncover (only if relevant).
- No "as an AI" disclaimers. No mealy-mouthed hedging. Be useful.`;
    try {
      const { content, credits } = await callChat(
        [{ role: "system", content: sys }, { role: "user", content: query }],
        true,
      );
      if (credits !== null) onCreditsChange(credits);
      const sources = extractSources(content, "quick");
      updateActive((i) => ({ ...i, quickAnswer: content, quickSources: sources }));
      pushActivity("found", "Quick answer ready", `${sources.length} citation${sources.length === 1 ? "" : "s"}`);
    } catch (e) {
      pushActivity("error", e instanceof Error ? e.message : "Quick answer failed");
      toast.error(e instanceof Error ? e.message : "Quick answer failed");
    } finally { setPhase("idle"); }
  };

  // Smart auto-route: classify the query and pick the right pipeline.
  const runAuto = async () => {
    if (!input.trim()) return;
    const kind = classifyQuery(input);
    if (kind === "quick") await runQuick();
    else await runFullPipeline();
  };


  const exportReport = () => {
    if (!active?.report) return;
    const md = [
      `# ${active.query}\n\n_Investigated at ${DEPTH_LABELS[active.depth].label} depth · ${new Date(active.updatedAt).toLocaleString()}_\n\n`,
      active.report,
      "\n\n## Sources\n\n",
      allSources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n"),
    ].join("");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${active.query.slice(0, 60).replace(/[^a-z0-9]+/gi, "-")}.md`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Simplified tab set: 3 tabs instead of 6
  const visibleTabs = (["research", "report", "sources"] as const);
  const [simpleTab, setSimpleTab] = useState<"research" | "report" | "sources">("research");

  // Auto-advance tab when report is ready.
  useEffect(() => {
    if (active?.report) setSimpleTab("report");
    else if (active && !active.report && active.subs.length > 0) setSimpleTab("research");
  }, [active?.id, !!active?.report]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top bar — clean, no redundant sidebar controls */}
      <div className="flex items-center justify-between border-b border-border/60 bg-card/20 px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Brain className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{active?.query || "New investigation"}</div>
            {active && <div className="text-[11px] text-muted-foreground">{DEPTH_LABELS[active.depth].label} · {DEPTH_LABELS[active.depth].tokens}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* 3 clean tabs */}
          {visibleTabs.map((t) => (
            <button key={t} onClick={() => setSimpleTab(t)}
              className={`rounded-full px-3 py-1.5 text-xs transition capitalize ${simpleTab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "research" && "Research"}
              {t === "report" && `Report${active?.report ? "" : ""}`}
              {t === "sources" && `Sources${allSources.length > 0 ? ` (${allSources.length})` : ""}`}
            </button>
          ))}
          {active?.report && (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={exportReport} title="Export as Markdown">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div ref={reportRef} className="flex-1 overflow-y-auto">
        {simpleTab === "research" && (
          <>
            {(!active?.plan && !active?.quickAnswer) ? (
              <PlanTab active={active} phase={phase} now={now} />
            ) : active?.isQuick ? (
              <QuickAnswerView active={active} />
            ) : (
              <div className="mx-auto max-w-3xl space-y-6 p-6">
                {/* Activity feed — ambient, not dominant */}
                {active && active.activity?.length > 0 && phase !== "idle" && (
                  <ActivityFeed events={active.activity} phase={phase} />
                )}
                {/* Sub-question progress */}
                {active && active.subs.length > 0 && <SubsTab active={active} now={now} />}
                {/* Plan details (thesis etc) — shown inline */}
                {active?.plan && (
                  <div className="rounded-xl border border-border/60 bg-card/60 p-5 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Thesis</p>
                    <p className="leading-relaxed text-foreground/90">{active.plan.thesis}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {simpleTab === "report" && (
          <ReportTab active={active} onExport={exportReport} onSuggestFollowUps={runFollowUps} onStartFollowUp={startFollowUp} />
        )}
        {simpleTab === "sources" && (
          <SourcesTab sources={allSources} subs={active?.subs ?? []} />
        )}
      </div>

        {/* Composer */}
        <div className="border-t border-border/60 bg-card/30 p-3">
          <div className="mx-auto max-w-4xl">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">Depth</span>
              <input
                type="range" min={1} max={5} value={depth}
                onChange={(e) => setDepth(Number(e.target.value) as Depth)}
                className="h-1 w-32 cursor-pointer accent-primary"
                disabled={phase !== "idle"}
              />
              <span className="font-medium">{DEPTH_LABELS[depth].label}</span>
              <span className="text-muted-foreground">· {DEPTH_LABELS[depth].subs}</span>
              {input.trim().length > 5 && phase === "idle" && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                  Auto-route: <span className="font-semibold text-foreground">{classifyQuery(input) === "quick" ? "Quick answer" : "Full Lab"}</span>
                </span>
              )}
              {tier !== "elite" && depth >= 4 && (
                <Link to="/pricing" className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  <Crown className="h-2.5 w-2.5" /> Elite gives this depth real teeth
                </Link>
              )}
              <span className="ml-auto text-muted-foreground">
                {phase === "idle" ? "Ready" :
                 phase === "quick" ? "Answering…" :
                 phase === "planning" ? "Planning…" :
                 phase === "investigating" ? "Investigating in parallel…" :
                 phase === "synthesizing" ? "Synthesizing report…" : "Working…"}
              </span>
            </div>
            <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-primary/50">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything — quick advice, a focused question, or a deep brief. The Lab routes automatically."
                className="min-h-[80px] resize-none border-0 bg-transparent pr-44 focus-visible:ring-0"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void runAuto(); } }}
                disabled={phase !== "idle"}
              />
              <div className="absolute bottom-2 right-2 flex gap-1.5">
                <Button size="sm" variant="ghost" disabled={phase !== "idle" || !input.trim()} onClick={runQuick} title="Force quick answer">
                  <MessageSquare className="h-3.5 w-3.5 mr-1" /> Quick
                </Button>
                <Button size="sm" variant="ghost" disabled={phase !== "idle" || !input.trim()} onClick={runFullPipeline} title="Force full Lab">
                  <Beaker className="h-3.5 w-3.5 mr-1" /> Full Lab
                </Button>
                <Button size="sm" disabled={phase !== "idle" || !input.trim()} onClick={runAuto} title="Auto-pick">
                  {phase !== "idle" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Zap className="h-3.5 w-3.5 mr-1" /> Run</>}
                </Button>
              </div>
            </div>
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              ⌘/Ctrl+Enter to run · <span className="font-medium">Run</span> auto-picks · <span className="font-medium">Quick</span> for advice · <span className="font-medium">Full Lab</span> for deep research
            </div>
          </div>
        </div>
      </div>
  );
}

// ---------- small helper views ----------
function QuickAnswerView({ active }: { active: Investigation }) {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-6">
        <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3 w-3 text-primary" /> Quick answer
        </div>
        <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
          <pre className="whitespace-pre-wrap font-sans text-sm">{active.quickAnswer}</pre>
        </div>
      </div>
      {active.quickSources && active.quickSources.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {active.quickSources.slice(0, 4).map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs transition hover:border-primary/40">
              <img src={`https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=16`} alt="" className="h-3.5 w-3.5 rounded-sm shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              <span className="truncate text-muted-foreground">{s.title || new URL(s.url).hostname}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ events, phase }: { events: ActivityEvent[]; phase: string }) {
  const recent = events.slice(-8);
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Activity className="h-3 w-3" /> Agent activity
        {phase !== "idle" && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />}
      </div>
      <div className="space-y-2">
        {recent.map((e, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0 mt-1.5" />
            <span className="text-muted-foreground leading-relaxed">{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- panels ----------
function PlanTab({ active, phase, now }: { active: Investigation | null; phase: string; now: number }) {
  if (!active) return null;
  if (!active.plan) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h3 className="font-display text-lg">Start an investigation</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Type your question below, pick a depth, and hit <strong>Run Lab</strong>. The Lab will draft a thesis, decompose your question into parallel sub-questions, search the web, and synthesize a long-form analyst memo with citations.
          </p>
          {phase === "planning" && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Drafting plan…
            </div>
          )}
        </div>
      </div>
    );
  }
  void now;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Thesis</div>
        <p className="text-base leading-relaxed">{active.plan.thesis}</p>
      </section>
      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Working hypotheses</div>
        <ul className="space-y-1.5 text-sm">
          {active.plan.hypotheses.map((h, i) => (
            <li key={i} className="flex gap-2"><span className="text-muted-foreground">{i + 1}.</span><span>{h}</span></li>
          ))}
        </ul>
      </section>
      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sub-questions ({active.subs.length})</div>
        <ul className="space-y-2">
          {active.subs.map((s, i) => (
            <li key={s.id} className="rounded-md border border-border/60 bg-card/30 p-3">
              <div className="text-sm font-medium"><span className="text-muted-foreground">Q{i + 1}.</span> {s.question}</div>
              {s.angle && <div className="mt-1 text-xs text-muted-foreground">Why: {s.angle}</div>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Report structure</div>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {active.plan.sections.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </section>
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <AlertCircle className="h-3 w-3" /> What would change our mind
        </div>
        <p className="text-sm text-muted-foreground">{active.plan.contrarian}</p>
      </section>
    </div>
  );
}

function SubsTab({ active, now }: { active: Investigation | null; now: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (!active || active.subs.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No sub-questions yet — run Plan first.</div>;
  }
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-6">
      {active.subs.map((s, i) => {
        const elapsed = s.startedAt ? (s.finishedAt ?? now) - s.startedAt : 0;
        const isOpen = expanded.has(s.id);
        return (
          <div key={s.id} className="rounded-lg border border-border/60 bg-card/30">
            <button
              className="flex w-full items-start gap-3 p-3 text-left"
              onClick={() => toggle(s.id)}
            >
              <div className="mt-0.5 shrink-0">
                {s.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />}
                {s.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {s.status === "done" && <Check className="h-4 w-4 text-emerald-500" />}
                {s.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Q{i + 1}. {s.question}</div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="capitalize">{s.status}</span>
                  {elapsed > 0 && <span>· {fmtElapsed(elapsed)}</span>}
                  {s.sources.length > 0 && <span>· {s.sources.length} sources</span>}
                </div>
              </div>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isOpen && s.answer && (
              <div className="border-t border-border/60 p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">{s.answer}</div>
                {s.sources.length > 0 && (
                  <div className="mt-3 border-t border-border/40 pt-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</div>
                    <ul className="space-y-1 text-xs">
                      {s.sources.map((src, j) => (
                        <li key={j}>
                          <a href={src.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            [{j + 1}] {src.title}
                          </a>
                          <span className="ml-2 text-muted-foreground">{new URL(src.url).hostname}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourcesTab({ sources, subs }: { sources: Source[]; subs: SubQuestion[] }) {
  if (sources.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Sources will appear here once you investigate.</div>;
  }
  // Group by domain
  const byDomain = new Map<string, Source[]>();
  for (const s of sources) {
    const d = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return "unknown"; } })();
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(s);
  }
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-xs text-muted-foreground">{sources.length} unique sources across {byDomain.size} domains</div>
      <div className="space-y-4">
        {Array.from(byDomain.entries()).sort((a, b) => b[1].length - a[1].length).map(([domain, items]) => (
          <div key={domain} className="rounded-lg border border-border/60 bg-card/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                alt=""
                className="h-3.5 w-3.5 rounded-sm"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
              />
              {domain}
              <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {items.map((src, i) => {
                const sub = subs.find((s) => s.id === src.subId);
                return (
                  <li key={i}>
                    <a href={src.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{src.title}</a>
                    {sub && <span className="ml-2 text-[11px] text-muted-foreground">via Q{subs.indexOf(sub) + 1}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({ events, phase }: { events: ActivityEvent[]; phase: string }) {
  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <Activity className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h3 className="font-display text-lg">No activity yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">As the agent plans, searches, and synthesizes, every step will stream into this timeline so you can see exactly how the answer was built.</p>
        </div>
      </div>
    );
  }
  const ICON: Record<ActivityKind, typeof Activity> = {
    info: Compass, plan: ListChecks, search: Search, found: Check, synthesize: BookOpen, quick: Zap, error: AlertCircle,
  };
  const TONE: Record<ActivityKind, string> = {
    info: "bg-muted text-foreground/80",
    plan: "bg-primary/10 text-primary",
    search: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    found: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    synthesize: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    quick: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    error: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg">Agent activity</h3>
        <span className="rounded-full border border-border/60 bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{events.length} events</span>
      </div>
      <ol className="relative space-y-3 border-l-2 border-border/60 pl-5">
        {events.map((e, i) => {
          const Icon = ICON[e.kind];
          const next = events[i + 1];
          const dt = next ? next.ts - e.ts : 0;
          return (
            <li key={i} className="relative">
              <span className={`absolute -left-[26px] grid h-5 w-5 place-items-center rounded-full ${TONE[e.kind]}`}>
                <Icon className="h-3 w-3" />
              </span>
              <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{e.msg}</div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                {e.meta && <div className="mt-0.5 text-xs text-muted-foreground">{e.meta}</div>}
                {dt > 0 && <div className="mt-1 text-[10px] text-muted-foreground/70">+{dt < 1000 ? `${dt}ms` : `${(dt / 1000).toFixed(1)}s`} after</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {phase !== "idle" && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
          <Loader2 className="h-3 w-3 animate-spin" /> Agent active
        </div>
      )}
    </div>
  );
}

function ReportTab({ active, onExport, onSuggestFollowUps, onStartFollowUp }: { active: Investigation | null; onExport: () => void; onSuggestFollowUps: () => void; onStartFollowUp: (q: string) => void }) {
  // Quick-answer view
  if (active?.isQuick && (active.quickAnswer || !active.report)) {
    if (!active.quickAnswer) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary/60" />
            <h3 className="font-display text-lg">Answering…</h3>
            <p className="mt-2 text-sm text-muted-foreground">Quick answer mode — no sub-questions, just a direct, useful response.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Quick answer</span>
          <span className="text-xs text-muted-foreground">Need depth? Hit <strong>Full Lab</strong> below.</span>
        </div>
        <h2 className="font-display text-2xl tracking-tight">{active.query}</h2>
        <article className="prose prose-sm dark:prose-invert mt-4 max-w-none whitespace-pre-wrap leading-relaxed">{active.quickAnswer}</article>
      </div>
    );
  }
  if (!active?.report) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h3 className="font-display text-lg">No report yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Run an investigation. For quick advice or focused questions use <strong>Quick</strong> — for deep multi-source briefs use <strong>Full Lab</strong>.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl tracking-tight">{active.query}</h2>
          <div className="mt-1 text-xs text-muted-foreground">{DEPTH_LABELS[active.depth].label} · {new Date(active.updatedAt).toLocaleString()}</div>
        </div>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="mr-1.5 h-3.5 w-3.5" /> Export .md</Button>
      </div>
      <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">{active.report}</article>

      {/* Follow-up investigations */}
      <div className="mt-10 rounded-2xl border border-primary/25 bg-primary/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Compass className="h-3 w-3" /> Where to dig next
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Spawn a new Lab investigation from any of these — Razen carries forward the framing.</p>
          </div>
          {!active.followUps?.length && (
            <Button size="sm" variant="outline" onClick={onSuggestFollowUps}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Suggest follow-ups
            </Button>
          )}
        </div>
        {active.followUps && active.followUps.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {active.followUps.map((f, i) => (
              <button
                key={i}
                onClick={() => onStartFollowUp(f.question)}
                className="group rounded-xl border border-border/70 bg-background p-4 text-left transition hover:border-primary/40 hover:bg-card"
              >
                <div className="flex items-start gap-2">
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{f.question}</div>
                    {f.angle && <div className="mt-1 text-xs leading-snug text-muted-foreground">{f.angle}</div>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotesTab({ active, onChange }: { active: Investigation | null; onChange: (n: string) => void }) {
  if (!active) return null;
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your notes</div>
      <Textarea
        value={active.notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Scratchpad — annotations, follow-ups, things to dig deeper on…"
        className="min-h-[400px] resize-none"
      />
    </div>
  );
}

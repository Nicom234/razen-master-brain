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
    subs: [], notes: "",
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

export function ResearchLab({ onCreditsChange, onExitResearch }: ResearchLabProps) {
  const [store, setStore] = useState<Record<string, Investigation>>(() => loadStore());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const s = loadStore();
    const ids = Object.keys(s).sort((a, b) => s[b].updatedAt - s[a].updatedAt);
    return ids[0] ?? null;
  });
  const [input, setInput] = useState("");
  const [depth, setDepth] = useState<Depth>(3);
  const [phase, setPhase] = useState<"idle" | "planning" | "investigating" | "synthesizing">("idle");
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<"plan" | "subs" | "sources" | "report" | "notes">("plan");
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

  const updateActive = (mut: (i: Investigation) => Investigation) => {
    if (!activeId) return;
    setStore((s) => {
      const cur = s[activeId]; if (!cur) return s;
      return { ...s, [activeId]: { ...mut(cur), updatedAt: Date.now() } };
    });
  };

  const createInvestigation = () => {
    const inv = newInvestigation();
    setStore((s) => ({ ...s, [inv.id]: inv }));
    setActiveId(inv.id);
    setInput(""); setTab("plan"); setPhase("idle");
  };

  const deleteInvestigation = (id: string) => {
    setStore((s) => { const n = { ...s }; delete n[id]; return n; });
    if (activeId === id) {
      const remaining = Object.keys(store).filter((k) => k !== id);
      setActiveId(remaining[0] ?? null);
    }
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
    updateActive((i) => ({ ...i, query, depth, plan: undefined, subs: [], report: undefined }));

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
      if (!parsed) { toast.error("Couldn't parse the plan — try rephrasing"); setPhase("idle"); return; }
      updateActive((i) => ({ ...i, plan: parsed.plan, subs: parsed.subs }));
      setTab("plan");
      toast.success(`Plan ready — ${parsed.subs.length} sub-questions`);
    } catch (e) {
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
    const sys = `You are a research analyst. Answer the sub-question concisely (300-500 words) using web search. Inline-cite every factual claim with [Title](url) markdown links. End with a 1-line "Confidence: high/medium/low — because ...".`;

    // Run in parallel, but cap concurrency so we don't blow rate limits.
    const concurrency = 3;
    let cursor = 0;
    const runOne = async (sub: SubQuestion) => {
      updateActive((i) => ({ ...i, subs: i.subs.map((s) => s.id === sub.id ? { ...s, status: "running", startedAt: Date.now() } : s) }));
      try {
        const { content, credits } = await callChat(
          [{ role: "system", content: sys }, { role: "user", content: `Question: ${sub.question}\n\nContext / why we care: ${sub.angle ?? "n/a"}\n\nQuery for the broader investigation: ${active.query}` }],
          true,
        );
        if (credits !== null) onCreditsChange(credits);
        const sources = extractSources(content, sub.id);
        updateActive((i) => ({ ...i, subs: i.subs.map((s) => s.id === sub.id ? { ...s, status: "done", answer: content, sources, finishedAt: Date.now() } : s) }));
      } catch (e) {
        updateActive((i) => ({ ...i, subs: i.subs.map((s) => s.id === sub.id ? { ...s, status: "error", answer: e instanceof Error ? e.message : "Failed", finishedAt: Date.now() } : s) }));
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, subs.length) }, async () => {
      while (cursor < subs.length) {
        const idx = cursor++;
        await runOne(subs[idx]);
      }
    });
    await Promise.all(workers);
    setPhase("idle");
    toast.success("Investigation complete — synthesize the report next");
  };

  // ---- 3. Synthesize final report ----
  const runSynthesis = async () => {
    if (!active || !active.plan || active.subs.some((s) => s.status !== "done" && s.status !== "error")) {
      toast.error("Run the investigation first"); return;
    }
    setPhase("synthesizing"); setTab("report");
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
      toast.success("Report synthesized");
      setTimeout(() => reportRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synthesis failed");
    } finally { setPhase("idle"); }
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

  const investigations = Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Left rail: investigations */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card/30 lg:flex">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Beaker className="h-4 w-4 text-primary" /> Research Lab
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={createInvestigation} title="New investigation">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {investigations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No investigations yet</div>
          ) : investigations.map((inv) => (
            <button
              key={inv.id}
              onClick={() => { setActiveId(inv.id); setTab("plan"); }}
              className={`group mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition ${
                activeId === inv.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{inv.query || "Untitled investigation"}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{DEPTH_LABELS[inv.depth].label}</span>
                  {inv.subs.length > 0 && <span>· {inv.subs.filter((s) => s.status === "done").length}/{inv.subs.length}</span>}
                </div>
              </div>
              <Trash2
                className="mt-0.5 h-3 w-3 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); deleteInvestigation(inv.id); }}
              />
            </button>
          ))}
        </div>
        <div className="border-t border-border/60 p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={onExitResearch}>
            ← Exit Research
          </Button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/60 bg-card/20 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Brain className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{active?.query || "New investigation"}</div>
              <div className="text-[11px] text-muted-foreground">{DEPTH_LABELS[depth].label} · {DEPTH_LABELS[depth].subs} · {DEPTH_LABELS[depth].tokens}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {(["plan", "subs", "sources", "report", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1.5 transition ${tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {t === "plan" && <span className="flex items-center gap-1.5"><ListChecks className="h-3 w-3" /> Plan</span>}
                {t === "subs" && <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> Sub-questions{active && active.subs.length > 0 ? ` (${active.subs.length})` : ""}</span>}
                {t === "sources" && <span className="flex items-center gap-1.5"><Quote className="h-3 w-3" /> Sources{allSources.length > 0 ? ` (${allSources.length})` : ""}</span>}
                {t === "report" && <span className="flex items-center gap-1.5"><BookOpen className="h-3 w-3" /> Report</span>}
                {t === "notes" && <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> Notes</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div ref={reportRef} className="flex-1 overflow-y-auto">
          {tab === "plan" && <PlanTab active={active} phase={phase} now={now} />}
          {tab === "subs" && <SubsTab active={active} now={now} />}
          {tab === "sources" && <SourcesTab sources={allSources} subs={active?.subs ?? []} />}
          {tab === "report" && <ReportTab active={active} onExport={exportReport} />}
          {tab === "notes" && <NotesTab active={active} onChange={(notes) => updateActive((i) => ({ ...i, notes }))} />}
        </div>

        {/* Composer */}
        <div className="border-t border-border/60 bg-card/30 p-3">
          <div className="mx-auto max-w-4xl">
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">Depth</span>
              <input
                type="range" min={1} max={5} value={depth}
                onChange={(e) => setDepth(Number(e.target.value) as Depth)}
                className="h-1 w-32 cursor-pointer accent-primary"
                disabled={phase !== "idle"}
              />
              <span className="font-medium">{DEPTH_LABELS[depth].label}</span>
              <span className="text-muted-foreground">· {DEPTH_LABELS[depth].subs} · {DEPTH_LABELS[depth].tokens}</span>
              <span className="ml-auto text-muted-foreground">{phase === "idle" ? "Ready" : phase === "planning" ? "Planning…" : phase === "investigating" ? "Investigating in parallel…" : "Synthesizing report…"}</span>
            </div>
            <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-primary/50">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything — e.g. ‘What are the realistic paths to AGI by 2030 according to the labs that publish technical roadmaps?’"
                className="min-h-[80px] resize-none border-0 bg-transparent pr-32 focus-visible:ring-0"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void runFullPipeline(); } }}
                disabled={phase !== "idle"}
              />
              <div className="absolute bottom-2 right-2 flex gap-1.5">
                <Button size="sm" variant="ghost" disabled={phase !== "idle" || !input.trim()} onClick={runPlanning} title="Just plan">
                  <ListChecks className="h-3.5 w-3.5 mr-1" /> Plan
                </Button>
                <Button size="sm" variant="ghost" disabled={phase !== "idle" || !active?.subs.length} onClick={runInvestigation} title="Run investigation">
                  <Search className="h-3.5 w-3.5 mr-1" /> Investigate
                </Button>
                <Button size="sm" disabled={phase !== "idle" || !input.trim()} onClick={runFullPipeline} title="Run the whole pipeline">
                  {phase !== "idle" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Zap className="h-3.5 w-3.5 mr-1" /> Run Lab</>}
                </Button>
              </div>
            </div>
            <div className="mt-1.5 text-[10px] text-muted-foreground">⌘/Ctrl+Enter to run · Plan → Investigate → Synthesize</div>
          </div>
        </div>
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
              <Globe className="h-3.5 w-3.5 text-muted-foreground" /> {domain}
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

function ReportTab({ active, onExport }: { active: Investigation | null; onExport: () => void }) {
  if (!active?.report) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h3 className="font-display text-lg">No report yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Run the investigation, then synthesis will produce a long-form analyst memo with inline citations.</p>
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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, Check, ChevronDown, ChevronRight, Download, ListChecks, Plus, RotateCcw,
  Sparkles, Target, AlertTriangle, Trash2, Loader2, Layout, Calendar as CalendarIcon,
  KanbanSquare, User, Flag, Zap, ChevronLeft, MoreHorizontal, Megaphone, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const STORAGE_KEY = "razen.plan.v2";

type Status = "todo" | "doing" | "done" | "blocked";
type Priority = "p0" | "p1" | "p2" | "p3";
type Task = {
  id: string;
  title: string;
  detail?: string;
  status: Status;
  priority?: Priority;
  owner?: string;       // free-text — initials shown as avatar
  due?: string;         // ISO yyyy-mm-dd
};
type Milestone = { id: string; title: string; why?: string; tasks: Task[]; collapsed?: boolean };
type Plan = {
  objective: string;
  assumptions: string[];
  milestones: Milestone[];
  risks: { title: string; mitigation: string; severity?: "low" | "med" | "high" }[];
  definitionOfDone: string[];
  // Optional decision log so we never lose the "why" from the latest standup.
  decisionLog?: { ts: number; entry: string }[];
};
type View = "outline" | "kanban" | "calendar";

const EMPTY: Plan = { objective: "", assumptions: [], milestones: [], risks: [], definitionOfDone: [], decisionLog: [] };

const STATUS_META: Record<Status, { label: string; tint: string; ring: string; dot: string }> = {
  todo:    { label: "Todo",     tint: "bg-card/70 border-border/70",                   ring: "border-border/60",          dot: "bg-muted-foreground/40" },
  doing:   { label: "In progress", tint: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30", ring: "border-amber-300/70 dark:border-amber-500/40", dot: "bg-amber-500" },
  done:    { label: "Done",     tint: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30", ring: "border-emerald-300/70 dark:border-emerald-500/40", dot: "bg-emerald-500" },
  blocked: { label: "Blocked",  tint: "bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30", ring: "border-rose-300/70 dark:border-rose-500/40", dot: "bg-rose-500" },
};
const STATUS_ORDER: Status[] = ["todo", "doing", "done", "blocked"];

const PRIORITY_META: Record<Priority, { label: string; tone: string }> = {
  p0: { label: "P0", tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  p1: { label: "P1", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  p2: { label: "P2", tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  p3: { label: "P3", tone: "bg-muted text-muted-foreground border-border/70" },
};

const PROMPT = `You are Razen — Plan mode. Convert the user's goal into an EXECUTABLE plan.

Return ONLY valid JSON (no prose, no code fences) matching exactly:
{
  "objective": "one decisive sentence",
  "assumptions": ["..."],
  "milestones": [
    { "title": "Milestone name", "why": "why this matters", "tasks": [
      { "title": "Atomic action verb-led", "detail": "1-line specifics", "priority": "p0|p1|p2|p3", "owner": "Suggested role e.g. PM, Eng, Design", "due": "+3d|+1w|+2w" }
    ]}
  ],
  "risks": [{ "title": "...", "mitigation": "...", "severity": "low|med|high" }],
  "definitionOfDone": ["concrete shippable checkpoint"]
}

Rules:
- 3-6 milestones, each with 3-7 atomic tasks.
- Tasks must be verb-led, specific, and finishable in <1 day each.
- Priorities: P0 (must ship), P1 (should ship), P2 (nice to have), P3 (later).
- Due hints are RELATIVE offsets like "+3d" (3 days), "+1w", "+2w", "+1m". Use realistic spacing.
- Owners are short role labels (e.g. "PM", "Eng", "Design", "Founder", "GTM").
- Risks must include a severity (low/med/high).
- Be opinionated. Sequence for leverage and speed.
- No filler, no generic advice.`;

const STANDUP_PROMPT = `You are Razen — Plan mode standup. Given the current plan state below, write a crisp Monday-morning standup memo.

Return ONLY markdown, no preamble. Structure:
**This week's focus** — one sentence naming the most important shippable.
**Done** — bullet list of completed tasks worth celebrating, grouped by milestone if useful.
**In progress** — bullets of what's actively moving, with owner + due in parens.
**Blocked** — bullets with the blocker named explicitly, plus a proposed unblock.
**Up next** — top 3-5 P0/P1 tasks to start in the next 2-3 days, in priority order.
**Risks worth watching** — at most 3 callouts with one-line mitigations.

Tone: direct, opinionated, leadership voice. No fluff. No status-theatre. Reference concrete task titles.`;

function uid() { return Math.random().toString(36).slice(2, 10); }

function relTimeToISO(rel: string | undefined): string | undefined {
  if (!rel) return undefined;
  const m = /^\+(\d+)\s*([dwm])$/i.exec(rel.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const now = new Date();
  if (unit === "d") now.setDate(now.getDate() + n);
  else if (unit === "w") now.setDate(now.getDate() + n * 7);
  else if (unit === "m") now.setMonth(now.getMonth() + n);
  return now.toISOString().slice(0, 10);
}

function parseJSON(text: string): Plan | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return {
      objective: String(obj.objective || ""),
      assumptions: Array.isArray(obj.assumptions) ? obj.assumptions.map(String) : [],
      milestones: Array.isArray(obj.milestones) ? obj.milestones.map((m: { title?: string; why?: string; tasks?: { title?: string; detail?: string; priority?: string; owner?: string; due?: string }[] }) => ({
        id: uid(),
        title: String(m.title || "Untitled"),
        why: m.why ? String(m.why) : undefined,
        tasks: Array.isArray(m.tasks) ? m.tasks.map((t) => {
          const p = (t.priority ?? "").toLowerCase();
          const priority: Priority | undefined = p === "p0" || p === "p1" || p === "p2" || p === "p3" ? p : undefined;
          return {
            id: uid(),
            title: String(t.title || ""),
            detail: t.detail ? String(t.detail) : undefined,
            status: "todo" as Status,
            priority,
            owner: t.owner ? String(t.owner) : undefined,
            due: relTimeToISO(t.due),
          };
        }) : [],
      })) : [],
      risks: Array.isArray(obj.risks) ? obj.risks.map((r: { title?: string; mitigation?: string; severity?: string }) => {
        const sev = (r.severity ?? "").toLowerCase();
        return {
          title: String(r.title || ""),
          mitigation: String(r.mitigation || ""),
          severity: sev === "low" || sev === "med" || sev === "high" ? sev : undefined,
        };
      }) : [],
      definitionOfDone: Array.isArray(obj.definitionOfDone) ? obj.definitionOfDone.map(String) : [],
      decisionLog: [],
    };
  } catch { return null; }
}

// Migrate any legacy v1 plan (with `done: bool` tasks) to the new model.
function migrate(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { plan?: unknown };
  const p = (r.plan ?? raw) as Record<string, unknown>;
  if (!p || typeof p !== "object") return null;
  try {
    return {
      objective: String(p.objective || ""),
      assumptions: Array.isArray(p.assumptions) ? (p.assumptions as unknown[]).map(String) : [],
      milestones: Array.isArray(p.milestones) ? (p.milestones as Array<{ id?: string; title?: string; why?: string; collapsed?: boolean; tasks?: Array<{ id?: string; title?: string; detail?: string; done?: boolean; status?: string; priority?: string; owner?: string; due?: string }> }>).map((m) => ({
        id: m.id || uid(),
        title: String(m.title || "Milestone"),
        why: m.why ? String(m.why) : undefined,
        collapsed: !!m.collapsed,
        tasks: (m.tasks || []).map((t) => {
          const status: Status =
            t.status === "doing" || t.status === "done" || t.status === "blocked" || t.status === "todo"
              ? t.status
              : t.done ? "done" : "todo";
          const pp = (t.priority ?? "").toLowerCase();
          const priority: Priority | undefined = pp === "p0" || pp === "p1" || pp === "p2" || pp === "p3" ? pp : undefined;
          return {
            id: t.id || uid(),
            title: String(t.title || ""),
            detail: t.detail ? String(t.detail) : undefined,
            status,
            priority,
            owner: t.owner ? String(t.owner) : undefined,
            due: t.due ? String(t.due) : undefined,
          };
        }),
      })) : [],
      risks: Array.isArray(p.risks) ? (p.risks as Array<{ title?: string; mitigation?: string; severity?: string }>).map((r) => {
        const sev = (r.severity ?? "").toLowerCase();
        return {
          title: String(r.title || ""),
          mitigation: String(r.mitigation || ""),
          severity: sev === "low" || sev === "med" || sev === "high" ? sev : undefined,
        };
      }) : [],
      definitionOfDone: Array.isArray(p.definitionOfDone) ? (p.definitionOfDone as unknown[]).map(String) : [],
      decisionLog: Array.isArray(p.decisionLog) ? (p.decisionLog as Array<{ ts?: number; entry?: string }>).map((d) => ({
        ts: typeof d.ts === "number" ? d.ts : Date.now(),
        entry: String(d.entry || ""),
      })) : [],
    };
  } catch { return null; }
}

function planToMarkdown(p: Plan): string {
  const lines: string[] = [];
  lines.push(`# ${p.objective || "Plan"}`, "");
  if (p.assumptions.length) {
    lines.push("## Assumptions");
    p.assumptions.forEach((a) => lines.push(`- ${a}`));
    lines.push("");
  }
  p.milestones.forEach((m, i) => {
    lines.push(`## ${i + 1}. ${m.title}`);
    if (m.why) lines.push(`_${m.why}_`, "");
    m.tasks.forEach((t) => {
      const box = t.status === "done" ? "[x]" : "[ ]";
      const pri = t.priority ? ` (${t.priority.toUpperCase()})` : "";
      const owner = t.owner ? ` @${t.owner}` : "";
      const due = t.due ? ` 📅 ${t.due}` : "";
      const status = t.status === "doing" ? " · in progress" : t.status === "blocked" ? " · 🚧 blocked" : "";
      lines.push(`- ${box} ${t.title}${pri}${owner}${due}${status}${t.detail ? ` — ${t.detail}` : ""}`);
    });
    lines.push("");
  });
  if (p.risks.length) {
    lines.push("## Risks");
    p.risks.forEach((r) => {
      const sev = r.severity ? ` [${r.severity.toUpperCase()}]` : "";
      lines.push(`- **${r.title}**${sev} — ${r.mitigation}`);
    });
    lines.push("");
  }
  if (p.definitionOfDone.length) {
    lines.push("## Definition of done");
    p.definitionOfDone.forEach((d) => lines.push(`- ${d}`));
    lines.push("");
  }
  if (p.decisionLog && p.decisionLog.length) {
    lines.push("## Decision log");
    p.decisionLog.slice().reverse().forEach((d) => {
      lines.push(`- ${new Date(d.ts).toLocaleString()} — ${d.entry}`);
    });
  }
  return lines.join("\n");
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "·";
}
function ownerColor(name: string): string {
  const palette = ["bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-teal-500", "bg-pink-500", "bg-orange-500"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function dueClass(iso?: string): string {
  if (!iso) return "text-muted-foreground";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "text-rose-600 dark:text-rose-400 font-medium";
  if (diff <= 1) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-muted-foreground";
}
function fmtDue(iso?: string): string {
  if (!iso) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff < 7) return `In ${diff}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SAMPLE_PROMPTS = [
  "Launch a paid newsletter for senior product designers — 1k subs in 90 days.",
  "Ship a B2B SaaS pricing page redesign in one 2-week sprint.",
  "Plan a product-led growth motion for a developer tool, $0→$50k MRR in 6 months.",
  "Run a 30-day cold-outbound experiment to land 5 enterprise pilots.",
  "Migrate our marketing site from WordPress to a headless stack in 4 weeks.",
];

interface PlanWorkspaceProps {
  onCreditsChange?: (n: number) => void;
}

export function PlanWorkspace({ onCreditsChange }: PlanWorkspaceProps) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<Plan>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [standupBusy, setStandupBusy] = useState(false);
  const [raw, setRaw] = useState("");
  const [view, setView] = useState<View>("outline");
  const [filterOwner, setFilterOwner] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null);
  const [standup, setStandup] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const obj = JSON.parse(saved);
        const m = migrate(obj);
        if (m) setPlan(m);
        if (obj?.goal) setGoal(obj.goal);
      } else {
        // attempt v1 fallback
        const old = localStorage.getItem("razen.plan.v1");
        if (old) {
          const obj = JSON.parse(old);
          const m = migrate(obj);
          if (m) setPlan(m);
          if (obj?.goal) setGoal(obj.goal);
        }
      }
    } catch { /* ignore */ }
  }, []);
  // Persist
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan, goal })); } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [plan, goal]);

  const owners = useMemo(() => {
    const s = new Set<string>();
    plan.milestones.forEach((m) => m.tasks.forEach((t) => { if (t.owner) s.add(t.owner); }));
    return Array.from(s);
  }, [plan]);

  const filteredPlan = useMemo<Plan>(() => {
    if (!filterOwner && !filterPriority) return plan;
    return {
      ...plan,
      milestones: plan.milestones.map((m) => ({
        ...m,
        tasks: m.tasks.filter((t) =>
          (!filterOwner || t.owner === filterOwner) &&
          (!filterPriority || t.priority === filterPriority),
        ),
      })),
    };
  }, [plan, filterOwner, filterPriority]);

  const totals = useMemo(() => {
    const all = plan.milestones.flatMap((m) => m.tasks);
    return {
      total: all.length,
      todo: all.filter((t) => t.status === "todo").length,
      doing: all.filter((t) => t.status === "doing").length,
      done: all.filter((t) => t.status === "done").length,
      blocked: all.filter((t) => t.status === "blocked").length,
    };
  }, [plan]);
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  // ──────────────────── core: generate ────────────────────
  async function generate() {
    const g = goal.trim();
    if (!g || loading) return;
    setLoading(true); setRaw("");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sign in required"); setLoading(false); return; }

      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode: "plan", useWebSearch: false,
          messages: [{ role: "user", content: `${PROMPT}\n\nGOAL:\n${g}` }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Plan failed"); setLoading(false); return;
      }
      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining && onCreditsChange) onCreditsChange(Number(remaining));

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = ""; let acc = "";
      while (true) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content;
            if (delta) { acc += delta; setRaw(acc); }
          } catch { /* */ }
        }
      }
      const parsed = parseJSON(acc);
      if (!parsed) { toast.error("Couldn't parse plan — try again or refine the goal."); }
      else { setPlan(parsed); toast.success("Plan ready"); }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  // ──────────────────── standup ────────────────────
  async function runStandup() {
    if (standupBusy) return;
    if (totals.total === 0) { toast.error("Generate a plan first."); return; }
    setStandupBusy(true);
    setStandup("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sign in required"); setStandupBusy(false); return; }
      const stateBlock = planToMarkdown(plan);
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode: "plan", useWebSearch: false,
          messages: [{ role: "user", content: `${STANDUP_PROMPT}\n\nCURRENT PLAN STATE:\n\n${stateBlock}` }],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})); toast.error(j.error || "Standup failed");
        setStandupBusy(false); return;
      }
      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining && onCreditsChange) onCreditsChange(Number(remaining));
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = ""; let acc = "";
      while (true) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content;
            if (delta) { acc += delta; setStandup(acc); }
          } catch { /* */ }
        }
      }
      // Append a decision-log entry pointing at the standup so it's preserved.
      setPlan((p) => ({ ...p, decisionLog: [...(p.decisionLog || []), { ts: Date.now(), entry: `Standup generated (${totals.done}/${totals.total} tasks done)` }] }));
    } finally {
      setStandupBusy(false);
    }
  }

  // ──────────────────── mutations ────────────────────
  function setStatus(mid: string, tid: string, status: Status) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : {
        ...m, tasks: m.tasks.map((t) => t.id !== tid ? t : { ...t, status }),
      }),
    }));
  }
  function cycleStatus(mid: string, tid: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : {
        ...m, tasks: m.tasks.map((t) => {
          if (t.id !== tid) return t;
          const order: Status[] = ["todo", "doing", "done", "blocked"];
          const next = order[(order.indexOf(t.status) + 1) % order.length];
          return { ...t, status: next };
        }),
      }),
    }));
  }
  function toggleCollapse(mid: string) {
    setPlan((p) => ({ ...p, milestones: p.milestones.map((m) => m.id === mid ? { ...m, collapsed: !m.collapsed } : m) }));
  }
  function addTask(mid: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : { ...m, tasks: [...m.tasks, { id: uid(), title: "New task", status: "todo" }] }),
    }));
  }
  function removeTask(mid: string, tid: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : { ...m, tasks: m.tasks.filter((t) => t.id !== tid) }),
    }));
  }
  function patchTask(mid: string, tid: string, patch: Partial<Task>) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : { ...m, tasks: m.tasks.map((t) => t.id === tid ? { ...t, ...patch } : t) }),
    }));
  }
  function moveTask(taskId: string, fromMilestone: string, toMilestone: string, toStatus?: Status) {
    setPlan((p) => {
      const fromM = p.milestones.find((m) => m.id === fromMilestone);
      if (!fromM) return p;
      const task = fromM.tasks.find((t) => t.id === taskId);
      if (!task) return p;
      return {
        ...p,
        milestones: p.milestones.map((m) => {
          if (m.id === fromMilestone && fromMilestone !== toMilestone) {
            return { ...m, tasks: m.tasks.filter((t) => t.id !== taskId) };
          }
          if (m.id === toMilestone) {
            const nextTask: Task = toStatus ? { ...task, status: toStatus } : task;
            const tasks = fromMilestone === toMilestone
              ? m.tasks.map((t) => t.id === taskId ? nextTask : t)
              : [...m.tasks, nextTask];
            return { ...m, tasks };
          }
          return m;
        }),
      };
    });
  }
  function reset() {
    if (!confirm("Reset the entire plan? This will clear every milestone, task, and risk.")) return;
    setPlan(EMPTY); setGoal(""); setRaw(""); setStandup(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  }
  function exportMd() {
    const md = planToMarkdown(plan);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "plan.md"; a.click();
    URL.revokeObjectURL(url);
  }

  const hasPlan = plan.milestones.length > 0;

  // ──────────────────── render ────────────────────
  if (!hasPlan) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
          <div className="relative">
            <div className="pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full opacity-30 blur-3xl"
                 style={{ background: "radial-gradient(circle, oklch(0.7 0.18 45 / 0.55), transparent 70%)" }} />
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary inline-flex items-center gap-1.5">
              <ListChecks className="h-3 w-3" /> Plan · McKinsey-grade
            </div>
            <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">Turn ambiguity<br />into a plan you can ship.</h1>
            <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
              Razen Plan converts a goal into a sequenced executable: milestones, atomic tasks, owners,
              priorities, due dates, risks, and a definition of done. View it as an outline, a Kanban,
              or a calendar. Generate a Monday-morning standup with one click.
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-border/70 bg-card shadow-card overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <div className="flex items-center gap-2 border-b border-border/40 px-5 py-3 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-primary" /> What are you trying to ship?
            </div>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Launch a paid newsletter for senior product designers, 1k subs in 90 days"
              rows={5}
              className="resize-none border-0 bg-transparent px-5 pt-3 pb-2 text-base focus-visible:ring-0 shadow-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-background/40 px-4 py-3">
              <div className="text-xs text-muted-foreground">⌘/Ctrl + Enter to generate</div>
              <Button size="sm" disabled={!goal.trim() || loading} onClick={generate} className="gap-1.5">
                {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Decomposing…</> : <><Sparkles className="h-3.5 w-3.5" /> Generate plan</>}
              </Button>
            </div>
          </div>

          {/* sample prompts */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Try a goal</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SAMPLE_PROMPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setGoal(s)}
                  className="rounded-xl border border-border/70 bg-card/60 p-3 text-left text-sm leading-snug text-foreground/80 transition hover:bg-card hover:shadow-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* loading skeleton / streaming raw preview */}
          {loading && (
            <div className="mt-6 rounded-2xl border bg-muted/30 p-5">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Streaming…
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{raw || "Thinking…"}</pre>
            </div>
          )}

          {/* capability strip */}
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { i: ListChecks, t: "Outline", d: "Milestones with verb-led atomic tasks. Owners, priorities, dates." },
              { i: KanbanSquare, t: "Kanban", d: "Drag tasks between Todo / Doing / Done / Blocked." },
              { i: CalendarIcon, t: "Calendar", d: "Tasks placed on due dates. Spot date crashes instantly." },
              { i: Megaphone, t: "Standup", d: "AI generates a leadership-grade Monday memo from current state." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-border/70 bg-card/40 p-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background">
                  <c.i className="h-4 w-4" />
                </div>
                <div className="mt-4 font-display text-base">{c.t}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Plan view (with views, filters, etc.) ──
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/30 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <input
            value={plan.objective}
            onChange={(e) => setPlan((p) => ({ ...p, objective: e.target.value }))}
            className="min-w-0 truncate bg-transparent font-display text-lg tracking-tight outline-none"
            placeholder="Objective"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View tabs */}
          <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background p-0.5 shadow-soft">
            <ViewBtn icon={Layout} label="Outline" active={view === "outline"} onClick={() => setView("outline")} />
            <ViewBtn icon={KanbanSquare} label="Kanban" active={view === "kanban"} onClick={() => setView("kanban")} />
            <ViewBtn icon={CalendarIcon} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} />
          </div>
          {/* Owner filter */}
          {owners.length > 0 && (
            <select
              value={filterOwner ?? ""}
              onChange={(e) => setFilterOwner(e.target.value || null)}
              className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs"
            >
              <option value="">All owners</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {/* Priority filter */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/70 bg-background p-0.5">
            {(["p0", "p1", "p2", "p3"] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(filterPriority === p ? null : p)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${filterPriority === p ? `${PRIORITY_META[p].tone} border` : "text-muted-foreground hover:text-foreground"}`}
                title={`Filter ${p.toUpperCase()}`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={runStandup} disabled={standupBusy}>
            {standupBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-xs">Standup</span>
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportMd}>
            <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline text-xs">Export</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /><span className="hidden sm:inline text-xs">Reset</span>
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="border-b border-border/60 px-4 py-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><strong className="text-foreground">{totals.done}</strong>/{totals.total} done</span>
            <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_META.doing.dot}`} />{totals.doing} in progress</span>
            <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_META.blocked.dot}`} />{totals.blocked} blocked</span>
          </div>
          <span className="font-medium text-foreground">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {view === "outline" && <OutlineView plan={filteredPlan} onCycle={cycleStatus} onAddTask={addTask} onRemoveTask={removeTask} onPatchTask={patchTask} onToggleCollapse={toggleCollapse} onMoveTask={moveTask} />}
        {view === "kanban"  && <KanbanView plan={filteredPlan} onSetStatus={setStatus} onMove={moveTask} />}
        {view === "calendar" && <CalendarView plan={filteredPlan} onPatchTask={patchTask} />}
      </div>

      {/* Standup modal */}
      {standup !== null && (
        <StandupModal text={standup} busy={standupBusy} onClose={() => setStandup(null)} />
      )}
    </div>
  );
}

// ─── Outline view ──────────────────────────────────────────────────────────
function OutlineView({
  plan, onCycle, onAddTask, onRemoveTask, onPatchTask, onToggleCollapse, onMoveTask,
}: {
  plan: Plan;
  onCycle: (mid: string, tid: string) => void;
  onAddTask: (mid: string) => void;
  onRemoveTask: (mid: string, tid: string) => void;
  onPatchTask: (mid: string, tid: string, p: Partial<Task>) => void;
  onToggleCollapse: (mid: string) => void;
  onMoveTask: (tid: string, fromMid: string, toMid: string) => void;
}) {
  const [drag, setDrag] = useState<{ tid: string; mid: string } | null>(null);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* Assumptions */}
      {plan.assumptions.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Assumptions</div>
          <ul className="space-y-1 text-sm">{plan.assumptions.map((a, i) => (<li key={i} className="text-foreground/80">• {a}</li>))}</ul>
        </div>
      )}

      {/* Milestones */}
      <div className="space-y-3">
        {plan.milestones.map((m, i) => {
          const taskCount = m.tasks.length;
          const doneCount = m.tasks.filter((t) => t.status === "done").length;
          return (
            <div
              key={m.id}
              className="rounded-xl border bg-card overflow-hidden"
              onDragOver={(e) => { if (drag) e.preventDefault(); }}
              onDrop={(e) => { if (drag) { e.preventDefault(); onMoveTask(drag.tid, drag.mid, m.id); setDrag(null); } }}
            >
              <button
                type="button"
                onClick={() => onToggleCollapse(m.id)}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/30 transition-colors"
              >
                {m.collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{m.title}</div>
                  {m.why && <div className="mt-0.5 text-xs text-muted-foreground truncate">{m.why}</div>}
                </div>
                <div className="text-xs text-muted-foreground">{doneCount}/{taskCount}</div>
              </button>

              {!m.collapsed && (
                <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                  {m.tasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDrag({ tid: t.id, mid: m.id })}
                      onDragEnd={() => setDrag(null)}
                      className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-background transition-colors"
                    >
                      <StatusButton status={t.status} onClick={() => onCycle(m.id, t.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            value={t.title}
                            onChange={(e) => onPatchTask(m.id, t.id, { title: e.target.value })}
                            className={`flex-1 min-w-[120px] bg-transparent text-sm outline-none ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}
                          />
                          {t.priority && (
                            <button
                              onClick={() => onPatchTask(m.id, t.id, { priority: nextPriority(t.priority) })}
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_META[t.priority].tone}`}
                              title="Cycle priority"
                            >{PRIORITY_META[t.priority].label}</button>
                          )}
                          {!t.priority && (
                            <button
                              onClick={() => onPatchTask(m.id, t.id, { priority: "p2" })}
                              className="rounded-md border border-dashed border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                              title="Set priority"
                            ><Flag className="h-2.5 w-2.5" /></button>
                          )}
                          <OwnerInput value={t.owner} onChange={(v) => onPatchTask(m.id, t.id, { owner: v || undefined })} />
                          <DueInput value={t.due} onChange={(v) => onPatchTask(m.id, t.id, { due: v || undefined })} />
                        </div>
                        {t.detail && <div className="mt-0.5 text-xs text-muted-foreground">{t.detail}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveTask(m.id, t.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => onAddTask(m.id)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                  >
                    <Plus className="h-3 w-3" /> Add task
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Risks */}
      {plan.risks.length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-destructive mb-3">
            <AlertTriangle className="h-3 w-3" /> Risks & mitigations
          </div>
          <div className="space-y-2">
            {plan.risks.map((r, i) => (
              <div key={i} className="text-sm flex items-start gap-2">
                {r.severity && <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  r.severity === "high" ? "bg-rose-500/20 text-rose-700 dark:text-rose-300" :
                  r.severity === "med"  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" :
                                          "bg-muted text-muted-foreground"
                }`}>{r.severity}</span>}
                <div>
                  <span className="font-medium">{r.title}</span>
                  <span className="text-muted-foreground"> — {r.mitigation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Definition of done */}
      {plan.definitionOfDone.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Definition of done</div>
          <ul className="space-y-1 text-sm">
            {plan.definitionOfDone.map((d, i) => (
              <li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{d}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────
function KanbanView({
  plan, onSetStatus, onMove,
}: {
  plan: Plan;
  onSetStatus: (mid: string, tid: string, s: Status) => void;
  onMove: (tid: string, fromMid: string, toMid: string, toStatus?: Status) => void;
}) {
  const [drag, setDrag] = useState<{ tid: string; mid: string } | null>(null);
  // Build columns by status; each task carries milestone label.
  const columns = STATUS_ORDER.map((status) => ({
    status,
    tasks: plan.milestones.flatMap((m) =>
      m.tasks.filter((t) => t.status === status).map((t) => ({ ...t, _milestone: m })),
    ),
  }));
  return (
    <div className="grid h-full grid-cols-2 gap-3 p-4 md:grid-cols-4 md:p-6">
      {columns.map((col) => {
        const meta = STATUS_META[col.status];
        return (
          <div
            key={col.status}
            onDragOver={(e) => { if (drag) e.preventDefault(); }}
            onDrop={(e) => {
              if (!drag) return;
              e.preventDefault();
              if (drag.mid) onMove(drag.tid, drag.mid, drag.mid, col.status);
              else onSetStatus("", drag.tid, col.status);
              setDrag(null);
            }}
            className={`flex flex-col rounded-xl border ${meta.ring} bg-card/30 p-3 min-h-[300px]`}
          >
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
              <span>{col.tasks.length}</span>
            </div>
            <div className="space-y-2 flex-1">
              {col.tasks.length === 0 && (
                <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground">Drop tasks here</div>
              )}
              {col.tasks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDrag({ tid: t.id, mid: t._milestone.id })}
                  onDragEnd={() => setDrag(null)}
                  className={`group cursor-grab rounded-lg border ${meta.tint} px-3 py-2.5 shadow-soft transition hover:shadow-card active:cursor-grabbing`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`flex-1 text-[13px] font-medium leading-snug ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                    {t.priority && (
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${PRIORITY_META[t.priority].tone}`}>{PRIORITY_META[t.priority].label}</span>
                    )}
                  </div>
                  {t.detail && <div className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">{t.detail}</div>}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{t._milestone.title}</span>
                    <div className="flex items-center gap-1.5">
                      {t.due && <span className={`text-[10px] ${dueClass(t.due)}`}>{fmtDue(t.due)}</span>}
                      {t.owner && <OwnerAvatar name={t.owner} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar view ──────────────────────────────────────────────────────────
function CalendarView({
  plan, onPatchTask,
}: {
  plan: Plan;
  onPatchTask: (mid: string, tid: string, p: Partial<Task>) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const month = cursor.getMonth();
  const year = cursor.getFullYear();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const cells: { date: Date | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= totalDays; d++) cells.push({ date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  // Build map of due → tasks
  const map = new Map<string, Array<Task & { _milestone: Milestone }>>();
  plan.milestones.forEach((m) => m.tasks.forEach((t) => {
    if (!t.due) return;
    if (!map.has(t.due)) map.set(t.due, []);
    map.get(t.due)!.push({ ...t, _milestone: m });
  }));
  const undated = plan.milestones.flatMap((m) => m.tasks.filter((t) => !t.due).map((t) => ({ ...t, _milestone: m })));
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-[1fr_280px]">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="rounded p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <div className="font-display text-base">{firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="rounded p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 border-b border-border/60 bg-card/40">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const iso = c.date ? c.date.toISOString().slice(0, 10) : "";
            const day = c.date?.getDate();
            const tasks = iso ? map.get(iso) ?? [] : [];
            const isToday = iso === todayISO;
            return (
              <div
                key={i}
                className={`min-h-[88px] border-b border-r border-border/40 p-1.5 text-xs ${isToday ? "bg-primary/5" : ""}`}
              >
                {c.date && (
                  <>
                    <div className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"}`}>{day}</div>
                    <div className="space-y-1">
                      {tasks.slice(0, 3).map((t) => (
                        <div key={t.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] ${STATUS_META[t.status].tint} border`}>
                          {t.priority && <span className="mr-1 font-semibold">{t.priority.toUpperCase()}</span>}
                          {t.title}
                        </div>
                      ))}
                      {tasks.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{tasks.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Undated rail */}
      <aside className="rounded-xl border bg-card p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">No due date</div>
        {undated.length === 0 ? (
          <p className="text-xs text-muted-foreground">Every task has a due date — nice.</p>
        ) : (
          <div className="space-y-1.5">
            {undated.map((t) => (
              <div key={t.id} className="rounded-md border border-border/60 bg-background/60 p-2 text-xs">
                <div className="font-medium leading-snug">{t.title}</div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] text-muted-foreground">{t._milestone.title}</span>
                  <input
                    type="date"
                    value={t.due ?? ""}
                    onChange={(e) => onPatchTask(t._milestone.id, t.id, { due: e.target.value || undefined })}
                    className="rounded border border-border/70 bg-background px-1 py-0.5 text-[10px]"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── Standup modal ──────────────────────────────────────────────────────────
function StandupModal({ text, busy, onClose }: { text: string; busy: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-3">
          <div className="flex items-center gap-2 font-display text-base">
            <Megaphone className="h-4 w-4 text-primary" /> Monday standup
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {busy && !text && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Drafting standup…</div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{text}</div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(text).then(() => toast.success("Copied")); }} disabled={!text}>
            Copy as Markdown
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function nextPriority(p?: Priority): Priority {
  const order: Priority[] = ["p0", "p1", "p2", "p3"];
  if (!p) return "p2";
  return order[(order.indexOf(p) + 1) % order.length];
}
function StatusButton({ status, onClick }: { status: Status; onClick: () => void }) {
  const meta = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Status: ${meta.label} · click to cycle`}
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
        status === "done" ? "border-emerald-500 bg-emerald-500 text-primary-foreground" :
        status === "doing" ? "border-amber-500 bg-amber-500/20" :
        status === "blocked" ? "border-rose-500 bg-rose-500/20" :
        "border-muted-foreground/30 hover:border-primary"
      }`}
    >
      {status === "done" && <Check className="h-3 w-3" />}
      {status === "doing" && <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-700 dark:text-amber-400" />}
      {status === "blocked" && <Zap className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400" />}
    </button>
  );
}
function OwnerInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={value ? `Owner: ${value}` : "Assign owner"}
        className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] transition ${value ? "" : "text-muted-foreground hover:text-foreground"}`}
      >
        {value ? <OwnerAvatar name={value} /> : <User className="h-3 w-3" />}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-[120px] rounded-md border border-border bg-popover p-1.5 shadow-lg">
          <input
            autoFocus
            defaultValue={value ?? ""}
            placeholder="Owner"
            onKeyDown={(e) => { if (e.key === "Enter") { onChange((e.target as HTMLInputElement).value.trim()); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
            onBlur={(e) => { onChange(e.target.value.trim()); setOpen(false); }}
            className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
function DueInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <label className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] transition ${value ? dueClass(value) : "text-muted-foreground hover:text-foreground"}`}>
      <CalendarIcon className="h-3 w-3" />
      {value ? <span>{fmtDue(value)}</span> : <span>Due</span>}
      <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="absolute opacity-0" style={{ width: 0, height: 0 }} />
    </label>
  );
}
function OwnerAvatar({ name }: { name: string }) {
  return (
    <span title={name} className={`grid h-4 w-4 place-items-center rounded-full text-[8px] font-semibold text-white ${ownerColor(name)}`}>
      {initials(name)}
    </span>
  );
}
function ViewBtn({ icon: Icon, label, active, onClick }: { icon: typeof Layout; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
// silence unused-import lints if any
void MoreHorizontal;

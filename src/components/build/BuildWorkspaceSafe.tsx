import { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from "react";
import {
  ArrowUp, Code2, Eye, FileCode, FileText, FileImage, Folder, FolderOpen,
  RefreshCw, Download, X, Sparkles, Terminal, Check,
  Copy, ExternalLink, Square, Trash2, Loader2, Wand2, Layers,
  Layout, Gamepad2, BarChart3, Newspaper, ShoppingBag, BookOpen, Smartphone,
  Globe, Zap, Rocket, ChevronRight, Hammer, ArrowLeft,
  Monitor, Tablet, Maximize2, Minimize2, Brain, Workflow,
  History, GitFork, Wrench, RotateCcw, MousePointer2, ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.default })),
);

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/build-codegen`;
const STORAGE_KEY = "razen.build.projects.v2";

type Tier = "free" | "pro" | "elite";
type FileMap = Record<string, string>;
type ChatMsg = { role: "user" | "assistant"; content: string; plan?: string; files?: string[]; ts: number };
type Snapshot = { ts: number; label: string; files: FileMap };
type Project = {
  id: string;
  title: string;
  prompt: string;
  files: FileMap;
  messages: ChatMsg[];
  updatedAt: number;
  createdAt: number;
  snapshots?: Snapshot[];
};

interface Props {
  tier: Tier;
  onExitBuild: () => void;
  onCreditsChange?: (n: number) => void;
  selectedId?: string | null;
  onRefresh?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────────
// Storage
// ────────────────────────────────────────────────────────────────────────────────
function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveProjects(list: Project[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30))); } catch { /* ignore */ }
}
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

// ────────────────────────────────────────────────────────────────────────────────
// Streaming protocol parser — incremental, partial-tag safe
// Handles:
//   <<<PLAN>>>one liner<<<END>>>
//   <<<FILE path/to/file.ext>>>...contents...<<<END>>>   (any number)
//   <<<DONE>>>
// ────────────────────────────────────────────────────────────────────────────────
type Parsed = {
  plan: string;
  files: FileMap;
  activePath: string | null;          // file currently being streamed
  activeContent: string;              // partial content of the file being streamed
  done: boolean;
};
function parseStream(buffer: string): Parsed {
  const out: Parsed = { plan: "", files: {}, activePath: null, activeContent: "", done: false };
  let i = 0;
  while (i < buffer.length) {
    if (buffer.startsWith("<<<DONE>>>", i)) { out.done = true; break; }
    if (buffer.startsWith("<<<PLAN>>>", i)) {
      const start = i + "<<<PLAN>>>".length;
      const end = buffer.indexOf("<<<END>>>", start);
      if (end === -1) { out.plan = buffer.slice(start); break; }
      out.plan = buffer.slice(start, end);
      i = end + "<<<END>>>".length;
      continue;
    }
    if (buffer.startsWith("<<<FILE ", i)) {
      const headerEnd = buffer.indexOf(">>>", i);
      if (headerEnd === -1) break; // partial header — wait
      const path = buffer.slice(i + "<<<FILE ".length, headerEnd).trim();
      const bodyStart = headerEnd + ">>>".length;
      const bodyEnd = buffer.indexOf("<<<END>>>", bodyStart);
      if (bodyEnd === -1) {
        // streaming this file
        out.activePath = path;
        out.activeContent = buffer.slice(bodyStart).replace(/^\n/, "");
        break;
      }
      const content = buffer.slice(bodyStart, bodyEnd).replace(/^\n/, "").replace(/\n$/, "");
      out.files[path] = content;
      i = bodyEnd + "<<<END>>>".length;
      continue;
    }
    // Skip stray characters / whitespace between tags.
    i += 1;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────────
// Iframe srcDoc builder — inlines local CSS + JS, rewrites refs
// ────────────────────────────────────────────────────────────────────────────────
function buildSrcDoc(files: FileMap): string {
  const html = files["index.html"] ?? files["public/index.html"] ?? files["src/index.html"];
  if (!html) return "";

  let doc = html;
  const seen = new Set<string>();

  // Inline <link rel="stylesheet" href="x.css">
  doc = doc.replace(
    /<link\b[^>]*?rel=["']stylesheet["'][^>]*?href=["']([^"']+)["'][^>]*?\/?>/gi,
    (full, href: string) => {
      const css = files[href] ?? files[href.replace(/^\.\//, "")];
      if (typeof css === "string") { seen.add(href); return `<style data-from="${href}">${css}</style>`; }
      return full;
    },
  );

  // Inline <script src="x.js"> ... </script>
  doc = doc.replace(
    /<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (full, pre: string, src: string, post: string) => {
      const code = files[src] ?? files[src.replace(/^\.\//, "")];
      if (typeof code !== "string") return full;
      seen.add(src);
      const isModule = /\btype=["']module["']/i.test(pre + post);
      const attr = isModule ? ' type="module"' : "";
      // Wrap in try/catch so a single error doesn't kill the rest of the page.
      return `<script${attr} data-from="${src}">try{\n${code}\n}catch(__e){console.error('[razen]',__e);window.parent&&window.parent.postMessage({__razen:true,kind:'error',msg:String(__e&&__e.message||__e),stack:String(__e&&__e.stack||'')},'*');}<\/script>`;
    },
  );

  // Append console hook + uncaught error reporter so the workspace can surface issues.
  // Plus the click-to-edit element inspector — when the parent toggles inspect
  // mode on, clicks in the iframe are captured and reported back as a stable
  // CSS selector + element metadata, never propagated to the actual element.
  const hook = `<script data-razen="hook">(function(){
    var send=function(kind,args){try{window.parent.postMessage({__razen:true,kind:kind,msg:Array.prototype.slice.call(args).map(function(a){try{return typeof a==='string'?a:JSON.stringify(a)}catch(_e){return String(a)}}).join(' ')},'*')}catch(_e){}};
    var orig={log:console.log,warn:console.warn,error:console.error,info:console.info};
    console.log=function(){send('log',arguments);orig.log.apply(console,arguments)};
    console.warn=function(){send('warn',arguments);orig.warn.apply(console,arguments)};
    console.error=function(){send('error',arguments);orig.error.apply(console,arguments)};
    console.info=function(){send('info',arguments);orig.info.apply(console,arguments)};
    window.addEventListener('error',function(e){try{window.parent.postMessage({__razen:true,kind:'error',msg:String(e.message||e.error||e),stack:String((e.error&&e.error.stack)||'')},'*')}catch(_e){}});
    window.addEventListener('unhandledrejection',function(e){try{window.parent.postMessage({__razen:true,kind:'error',msg:'Unhandled: '+String(e.reason&&e.reason.message||e.reason)},'*')}catch(_e){}});

    /* ── Click-to-edit element inspector ── */
    var __inspect=false;
    var __hover=null;
    var styleEl=document.createElement('style');
    styleEl.textContent='.__razen-hover{outline:2px solid #f97316!important;outline-offset:2px!important;cursor:crosshair!important;background:rgba(249,115,22,0.08)!important}.__razen-cursor *{cursor:crosshair!important}';
    document.head.appendChild(styleEl);
    function buildSelector(el){
      if(!el||el===document.body)return 'body';
      if(el.id) return '#'+el.id;
      var path=[];
      var cur=el;
      while(cur&&cur!==document.body&&path.length<5){
        var name=cur.tagName.toLowerCase();
        if(cur.className&&typeof cur.className==='string'){
          var cls=cur.className.trim().split(/\\s+/).filter(function(c){return c&&!c.startsWith('__razen')}).slice(0,2);
          if(cls.length)name+='.'+cls.join('.');
        }
        var sib=cur.parentNode?Array.prototype.indexOf.call(cur.parentNode.children,cur):0;
        if(sib>0&&!cur.id)name+=':nth-child('+(sib+1)+')';
        path.unshift(name);
        cur=cur.parentNode;
      }
      return path.join(' > ');
    }
    window.addEventListener('message',function(e){
      if(e.data&&e.data.__razenInspect!==undefined){
        __inspect=!!e.data.__razenInspect;
        if(__inspect)document.body.classList.add('__razen-cursor');
        else{document.body.classList.remove('__razen-cursor');if(__hover)__hover.classList.remove('__razen-hover');__hover=null;}
      }
    });
    document.addEventListener('mouseover',function(e){
      if(!__inspect)return;
      if(__hover)__hover.classList.remove('__razen-hover');
      __hover=e.target;
      __hover.classList.add('__razen-hover');
    },true);
    document.addEventListener('click',function(e){
      if(!__inspect)return;
      e.preventDefault();e.stopPropagation();
      var el=e.target;
      try{
        var text=(el.innerText||el.textContent||'').trim().slice(0,100);
        window.parent.postMessage({__razen:true,kind:'inspect',selector:buildSelector(el),tag:el.tagName.toLowerCase(),text:text,classes:String(el.className||'').slice(0,200)},'*');
      }catch(_e){}
    },true);
  })();<\/script>`;
  if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, hook + "</head>");
  else doc = hook + doc;
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────────
// Curated, world-class preset prompts (built to wow on first run)
// ────────────────────────────────────────────────────────────────────────────────
type Preset = { id: string; label: string; icon: typeof Layout; group: string; prompt: string; gradient: string };
const PRESETS: Preset[] = [
  {
    id: "saas-landing", label: "SaaS landing — 'Quill'", group: "Landing pages", icon: Rocket,
    gradient: "from-orange-200 via-amber-100 to-rose-100",
    prompt: "Design and build the marketing site for **Quill**, a meeting-intelligence AI for product teams. Apple-clean aesthetic — generous whitespace, restrained type (Inter + Space Grotesk), single warm accent. Sections: sticky nav with anchor links + working theme toggle, hero with eyebrow tag/headline/subhead/dual CTA + a stylised product mock to the right, logo strip (5 fake but plausible enterprise marks), three-up feature cards with icon + headline + 2-line body, an animated 'how it works' 4-step strip, a long-form testimonial carousel with avatar circles, three-tier pricing with a 'Most popular' middle plan and a working monthly/annual toggle that updates prices with Tailwind transition, FAQ accordion, big closing CTA, full footer with policies. Every link works (smooth-scroll OR opens a footer modal). Primary CTA opens a real signup modal that validates email + password and persists to localStorage. Theme toggle persists. Polished micro-interactions throughout."
  },
  {
    id: "fintech-dash", label: "Dark glass fintech dashboard", group: "Dashboards", icon: BarChart3,
    gradient: "from-slate-900 via-indigo-900 to-purple-900",
    prompt: "Build a dark glassmorphic fintech dashboard for a fictional company called **Lumen Capital**. Sidebar nav (Overview, Transactions, Cards, Investments, Reports, Settings), top bar with searchable command palette (Cmd+K) + notifications dropdown + avatar menu. Dashboard: 4 KPI cards with sparkline trends (use chart.js), a large revenue chart with 7d/30d/90d/1y toggle that re-renders the chart, a sortable filterable transactions table (search by merchant, filter by category, click headers to sort, pagination), recent activity feed, an investment allocation donut chart, a 'spending by category' horizontal bar chart. Realistic seed: 60 transactions with merchant names like Stripe, Figma, AWS, Notion, Vercel, dates spread over 3 months, categories. All buttons + filters + sorts + pagination work. Dark mode by default with a subtle gradient mesh background."
  },
  {
    id: "kanban", label: "Kanban with drag & drop", group: "Productivity", icon: Layers,
    gradient: "from-sky-100 via-cyan-100 to-emerald-100",
    prompt: "Build **Drift**, a beautiful Kanban board app. Three columns: Backlog, In Progress, Done. Each card has a title, description preview, due date, priority dot, assignee initials avatar, tag chips. Click a card to open a detail drawer (right-side sliding panel) with full edit form + checklist + comments. Add card button per column opens an inline composer. Native HTML5 drag-and-drop to reorder within and between columns, with subtle ghost preview. Filter bar: search, tag filter, assignee filter. Header has board name (editable inline), avatar stack, share button (copies a fake share URL with toast). 12 seeded cards across columns with realistic content (e.g. 'Wire up Stripe subscription webhook'). Persist to localStorage. Slick spring-feel transitions on drop. Soft, modern aesthetic — Linear-inspired."
  },
  {
    id: "portfolio", label: "Editorial portfolio", group: "Personal", icon: BookOpen,
    gradient: "from-stone-200 via-rose-100 to-amber-100",
    prompt: "Design **Aria Lin's** photographer/designer portfolio. Editorial fashion-magazine aesthetic — Fraunces serif headlines, Inter body, oversized hero image collage with parallax on scroll. Sections: hero, about (long-form first-person paragraph + portrait), selected works grid (8 projects with hover reveal of title + year), case study detail modal (clicking a work opens full-screen with image carousel + brief + role + outcomes), press strip with 6 publication marks, contact form (validated, submits to localStorage with success state). Smooth scroll, image lazy-loading, refined cursor follower on desktop. Use real Unsplash hotlinks for photography. Every nav anchor works."
  },
  {
    id: "ecommerce", label: "Boutique e-commerce", group: "Commerce", icon: ShoppingBag,
    gradient: "from-rose-100 via-orange-100 to-yellow-100",
    prompt: "Build **Hesperide**, a small-batch perfume e-commerce site. Warm cream + dusty rose palette, serif display, generous whitespace. Sections: hero with hero product image + brand line, shop grid (12 perfumes, each with name, notes, price, hover swap to alternate angle), filter sidebar (notes: floral/woody/citrus/oriental — multi-select), product detail modal (image gallery, description, notes, size selector, quantity, Add to bag), sliding cart drawer (with quantity + remove + subtotal + checkout button → opens shipping form modal that confirms 'Order placed — order #1042'), wishlist (heart icon toggles + counter in header), reviews section with star ratings, newsletter footer. Cart persists to localStorage. Realistic French-brand product names like 'Nuit de Bergamote', 'Vétiver d'Été'."
  },
  {
    id: "snake", label: "Neon arcade — Snake", group: "Games & toys", icon: Gamepad2,
    gradient: "from-fuchsia-900 via-purple-900 to-emerald-900",
    prompt: "Build a polished neon arcade Snake game. Canvas-based, smooth 60fps, dark CRT-style background with chromatic aberration glow, neon green snake, magenta food pellet, particle burst on eat. Score, high-score (localStorage), pause (Space), arrow keys + WASD + on-screen swipe-pad for mobile, difficulty selector (Slow/Med/Fast/Insane), responsive board sizing. Game-over overlay with score, new-high flash, and Restart. Beautiful start screen with retro pixel-styled headline 'NEON SNAKE' and Play button."
  },
  {
    id: "writer", label: "Markdown writer w/ split preview", group: "Tools", icon: Newspaper,
    gradient: "from-amber-50 via-stone-100 to-neutral-200",
    prompt: "Build a focused Markdown writing app called **Scriv**. Split view: editor on the left (textarea-styled, monospace, line numbers gutter, 60ch column), live preview on the right (rendered with marked.js + dompurify). Top bar: doc title (editable), word count, reading time, theme toggle (light/dark), export (.md + .html — both trigger downloads), import (file picker that fills editor). Sidebar: list of saved docs in localStorage, +New, rename inline, delete. Cmd+S saves & shows toast 'Saved'. Slash commands in editor: type '/h1' or '/quote' to insert markdown. Distraction-free toggle hides chrome. Calm sepia/cream theme by default."
  },
  {
    id: "pomodoro", label: "Mindful pomodoro timer", group: "Tools", icon: Zap,
    gradient: "from-emerald-100 via-teal-100 to-sky-100",
    prompt: "Build **Bloom**, a beautiful mindful pomodoro timer. Big circular SVG progress ring at the centre with the current minutes:seconds inside, breathing-glow accent. Modes: Focus 25 / Short break 5 / Long break 15 — with tabs that animate. Start/Pause/Reset. Session counter (4 focus → long break). Task input above timer ('What are you working on?') is preserved across sessions. End-of-session chime (Web Audio API, soft bell). Settings drawer: customize durations + sound on/off + theme. Light + dark themes, persists. Optional ambient soundscape toggles (rain, forest, café — generated with simple oscillators or skip if too complex)."
  },
  {
    id: "weather", label: "Glassy weather app", group: "Apps", icon: Globe,
    gradient: "from-blue-700 via-indigo-700 to-purple-800",
    prompt: "Build **Skyline**, a glassy weather app. Deep blue-to-purple gradient background that subtly animates, frosted glass cards. Search city (with autocomplete from a hardcoded list of 30 major cities — no API). Default city: Reykjavik. Show current temp huge, condition with custom SVG icon, feels-like, humidity, wind. Hourly strip (12 hours) with temp+icon. 7-day forecast list. Toggle °C/°F (persists). All forecast data is plausibly generated client-side from seeded data per city. Add-to-favorites (heart) shows quick-switch chips at top. Subtle particle weather effects (rain dots, snow, sun rays) layered behind based on current condition."
  },
  {
    id: "mobile-app", label: "Mobile-first habit tracker", group: "Apps", icon: Smartphone,
    gradient: "from-violet-200 via-pink-200 to-rose-200",
    prompt: "Build **Streak**, a mobile-first habit tracker styled like a polished iOS app. Phone-frame container 390px wide centred on desktop, full screen on mobile. Bottom tab bar: Today, Habits, Stats, Profile. Today: list of today's habits with circular check buttons that fill on tap with spring animation, daily streak counter at top. Habits: list with reorder + add new (modal with emoji picker + colour + frequency days-of-week). Stats: 30-day heatmap calendar, current streaks, completion rate. Profile: name, settings. Localstorage persistence. Uses a soft pastel palette, SF-Pro-like font (Inter), rounded corners, subtle haptic-like animations on tap."
  },
];
const PRESET_GROUPS = Array.from(new Set(PRESETS.map((p) => p.group)));

// ────────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────────
export function BuildWorkspaceSafe({ tier, onExitBuild, onCreditsChange, selectedId, onRefresh }: Props) {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [activeStream, setActiveStream] = useState<Parsed | null>(null);
  const [iterInput, setIterInput] = useState("");
  const [view, setView] = useState<"preview" | "code" | "console">("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [consoleEntries, setConsoleEntries] = useState<{ kind: string; msg: string; ts: number }[]>([]);
  const [iframeKey, setIframeKey] = useState(0);
  const [model, setModel] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedEl, setSelectedEl] = useState<{ selector: string; tag: string; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialPromptRef = useRef<HTMLTextAreaElement>(null);
  const iterRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);
  const allFiles: FileMap = useMemo(() => {
    if (!active) return {};
    if (!streaming || !activeStream) return active.files;
    const merged: FileMap = { ...active.files, ...activeStream.files };
    if (activeStream.activePath) merged[activeStream.activePath] = activeStream.activeContent;
    return merged;
  }, [active, streaming, activeStream]);
  const fileList = useMemo(() => Object.keys(allFiles).sort(filePathSort), [allFiles]);

  // Auto-select index.html / first file when files appear.
  useEffect(() => {
    if (selectedFile && allFiles[selectedFile]) return;
    if (fileList.includes("index.html")) setSelectedFile("index.html");
    else if (fileList[0]) setSelectedFile(fileList[0]);
    else setSelectedFile(null);
  }, [fileList, selectedFile, allFiles]);

  // Listen to iframe console + errors + element-inspector events.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d !== "object" || !d.__razen) return;
      if (d.kind === "inspect") {
        setSelectedEl({ selector: String(d.selector || ""), tag: String(d.tag || ""), text: String(d.text || "") });
        setInspectMode(false);
        return;
      }
      setConsoleEntries((arr) => [...arr.slice(-200), { kind: String(d.kind || "log"), msg: String(d.msg || ""), ts: Date.now() }]);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Push inspect-mode changes into the iframe.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ __razenInspect: inspectMode }, "*");
  }, [inspectMode]);

  // Persist projects on change.
  useEffect(() => { saveProjects(projects); }, [projects]);

  // Sync with parent-selected project (from app.tsx sidebar).
  useEffect(() => {
    if (selectedId === null) {
      setActiveId(null); // "New build" → show landing
    } else if (selectedId && selectedId !== activeId) {
      // Abort any in-progress stream before switching projects.
      abortRef.current?.abort();
      setStreaming(false);
      setActiveStream(null);
      setStreamBuf("");
      setActiveId(selectedId);
      setView("preview");
      setSelectedFile(null);
      setConsoleEntries([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Auto-scroll chat as it streams.
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, streamBuf]);

  // Build srcDoc for the iframe — recomputes on file changes.
  const srcDoc = useMemo(() => buildSrcDoc(allFiles), [allFiles]);
  const errorCount = consoleEntries.filter((e) => e.kind === "error").length;

  // ──────────────────────────── core: stream a generation ─────────────────────────
  const stream = useCallback(async (opts: {
    project: Project;
    userPrompt: string;
    iteration: boolean;
  }) => {
    const { project, userPrompt, iteration } = opts;
    setConsoleEntries([]);
    setStreaming(true);
    setStreamBuf("");
    setActiveStream({ plan: "", files: {}, activePath: null, activeContent: "", done: false });

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Build messages — for iteration, include prior user/assistant turns so the
    // model has the conversation context (assistant content is a short summary,
    // not the raw artifacts which are passed via currentFiles).
    const history: { role: "user" | "assistant"; content: string }[] = [];
    project.messages.forEach((m) => {
      if (m.role === "user") history.push({ role: "user", content: m.content });
      else history.push({
        role: "assistant",
        content: m.plan ? `${m.plan}\nFiles updated: ${(m.files || []).join(", ")}` : "(previous build)",
      });
    });
    history.push({ role: "user", content: userPrompt });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sign in required"); setStreaming(false); return; }

      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: history, currentFiles: iteration ? project.files : undefined }),
        signal: ctrl.signal,
      });

      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining && onCreditsChange) onCreditsChange(Number(remaining));
      const usedModel = res.headers.get("X-Model");
      if (usedModel) setModel(usedModel);

      if (!res.ok) {
        const j: { error?: string } = await res.json().catch(() => ({} as { error?: string }));
        toast.error(j.error || `Build failed (${res.status})`);
        setStreaming(false);
        return;
      }
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":") || !line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const delta: string | undefined = obj.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setStreamBuf(acc);
              setActiveStream(parseStream(acc));
            }
          } catch { /* partial json — skip */ }
        }
      }

      const finalParsed = parseStream(acc);
      // Commit a chat turn + merge files into the project.
      setProjects((all) => all.map((p) => {
        if (p.id !== project.id) return p;
        const mergedFiles: FileMap = iteration ? { ...p.files, ...finalParsed.files } : { ...finalParsed.files };
        // Capture a snapshot of the prior state so the user can restore.
        const priorSnap: Snapshot | null =
          iteration && Object.keys(p.files).length > 0
            ? { ts: Date.now(), label: shortLabel(userPrompt), files: { ...p.files } }
            : null;
        const snaps = priorSnap ? [priorSnap, ...(p.snapshots ?? [])].slice(0, 20) : (p.snapshots ?? []);
        const updated: Project = {
          ...p,
          files: mergedFiles,
          snapshots: snaps,
          updatedAt: Date.now(),
          messages: [
            ...p.messages,
            { role: "user", content: userPrompt, ts: Date.now() },
            {
              role: "assistant",
              content: finalParsed.plan || (iteration ? "Iterated on the project." : "Built the project."),
              plan: finalParsed.plan,
              files: Object.keys(finalParsed.files),
              ts: Date.now() + 1,
            },
          ],
        };
        return updated;
      }));
      setStreaming(false);
      setActiveStream(null);
      setStreamBuf("");
      if (Object.keys(finalParsed.files).length === 0 && !iteration) {
        toast.error("No files produced — try refining your prompt.");
      } else {
        toast.success(iteration ? "Updated" : "Built");
        // Force preview reload for iteration so blob caches don't linger.
        setIframeKey((k) => k + 1);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.message("Generation stopped");
      } else {
        toast.error(e instanceof Error ? e.message : "Build failed");
      }
      setStreaming(false);
      setActiveStream(null);
    }
  }, [onCreditsChange]);

  // ──────────────────────────── new project ─────────────────────────
  const startNew = useCallback((prompt: string) => {
    const text = prompt.trim();
    if (!text || streaming) return;
    const id = uid();
    const proj: Project = {
      id,
      title: smartTitle(text),
      prompt: text,
      files: {},
      messages: [],
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    setProjects((p) => [proj, ...p]);
    setActiveId(id);
    setView("preview");
    void stream({ project: proj, userPrompt: text, iteration: false });
    setTimeout(() => onRefresh?.(), 200);
  }, [streaming, stream, onRefresh]);

  const iterate = useCallback((prompt: string) => {
    if (!active || streaming) return;
    const text = prompt.trim();
    if (!text) return;
    // If an element is selected, pin its reference to the prompt so the model
    // can target it precisely. This is the click-to-edit primitive.
    let finalPrompt = text;
    if (selectedEl) {
      const ref = `the ${selectedEl.tag} element matching selector \`${selectedEl.selector}\`${selectedEl.text ? ` (containing the text "${selectedEl.text}")` : ""}`;
      finalPrompt = `${text}\n\nApply this change specifically to ${ref}. If the selector no longer matches after the change, prefer the visually equivalent element.`;
    }
    setIterInput("");
    setSelectedEl(null);
    void stream({ project: active, userPrompt: finalPrompt, iteration: true });
  }, [active, streaming, stream, selectedEl]);

  // ──────────────────────────── ZIP export ─────────────────────────
  const exportZip = async () => {
    if (!active) return;
    const zip = new JSZip();
    Object.entries(allFiles).forEach(([p, c]) => zip.file(p, c));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${active.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  const openInNewTab = () => {
    if (!srcDoc) return;
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const copyFile = async () => {
    if (!selectedFile) return;
    try { await navigator.clipboard.writeText(allFiles[selectedFile] || ""); toast.success("Copied"); }
    catch { toast.error("Copy blocked"); }
  };

  const stopStream = () => abortRef.current?.abort();

  const forkProject = useCallback(() => {
    if (!active) return;
    const id = uid();
    const fork: Project = {
      ...active,
      id,
      title: `${active.title} (fork)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [...active.messages],
      files: { ...active.files },
      snapshots: [],
    };
    setProjects((p) => [fork, ...p]);
    setActiveId(id);
    toast.success("Forked");
  }, [active]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    if (!active) return;
    setProjects((all) => all.map((p) => {
      if (p.id !== active.id) return p;
      const priorSnap: Snapshot = { ts: Date.now(), label: "before restore", files: { ...p.files } };
      return {
        ...p,
        files: { ...snap.files },
        snapshots: [priorSnap, ...(p.snapshots ?? [])].slice(0, 20),
        updatedAt: Date.now(),
      };
    }));
    setIframeKey((k) => k + 1);
    setHistoryOpen(false);
    toast.success("Restored");
  }, [active]);

  const fixErrors = useCallback(() => {
    if (!active || streaming) return;
    const errs = consoleEntries.filter((e) => e.kind === "error").slice(-6);
    if (errs.length === 0) return;
    const detail = errs.map((e, i) => `${i + 1}. ${e.msg}`).join("\n");
    const prompt = `The preview is throwing these errors. Diagnose and fix them — do not regress unrelated behavior:\n\n${detail}`;
    void stream({ project: active, userPrompt: prompt, iteration: true });
  }, [active, streaming, consoleEntries, stream]);

  const deleteProject = (id: string) => {
    setProjects((all) => all.filter((p) => p.id !== id));
    if (activeId === id) { setActiveId(null); setView("preview"); setSelectedFile(null); }
    setTimeout(() => onRefresh?.(), 200);
  };

  const back = () => {
    if (streaming) abortRef.current?.abort();
    setActiveId(null);
    setView("preview");
    setSelectedFile(null);
  };

  // ──────────────────────────── render ─────────────────────────
  if (!active) {
    return (
      <BuildLanding
        tier={tier}
        projects={projects}
        onOpen={(id) => { setActiveId(id); setView("preview"); }}
        onDelete={deleteProject}
        onExitBuild={onExitBuild}
        onStart={startNew}
        promptRef={initialPromptRef}
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      {/* Top toolbar */}
      <div className="flex h-12 items-center justify-between gap-2 border-b border-border/60 bg-card/50 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={back}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <Hammer className="h-3.5 w-3.5" />
          </div>
          <input
            value={active.title}
            onChange={(e) => setProjects((all) => all.map((p) => p.id === active.id ? { ...p, title: e.target.value } : p))}
            className="min-w-0 truncate bg-transparent font-display text-base outline-none"
          />
          {streaming && (
            <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" /><span className="relative h-1.5 w-1.5 rounded-full bg-primary" /></span>
              {activeStream?.activePath ? `Writing ${activeStream.activePath}` : "Generating"}
            </span>
          )}
          {model && !streaming && (
            <span className="hidden md:inline rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{prettyModel(model)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* View tabs */}
          <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-0.5 shadow-soft">
            <ViewTab icon={Eye} label="Preview" active={view === "preview"} onClick={() => setView("preview")} />
            <ViewTab icon={Code2} label="Code" active={view === "code"} onClick={() => setView("code")} />
            <ViewTab icon={Terminal} label="Console" active={view === "console"} onClick={() => setView("console")} badge={errorCount || undefined} />
          </div>
          {view === "preview" && (
            <>
              <div className="ml-1 hidden sm:flex items-center gap-0.5 rounded-full border border-border/70 bg-background p-0.5">
                <DeviceBtn icon={Monitor} active={device === "desktop"} onClick={() => setDevice("desktop")} title="Desktop" />
                <DeviceBtn icon={Tablet} active={device === "tablet"} onClick={() => setDevice("tablet")} title="Tablet" />
                <DeviceBtn icon={Smartphone} active={device === "mobile"} onClick={() => setDevice("mobile")} title="Mobile" />
              </div>
              <Button
                variant={inspectMode ? "default" : "ghost"} size="sm"
                className={`h-8 gap-1 px-2 ${inspectMode ? "bg-primary text-primary-foreground" : ""}`}
                title="Click any element in the preview, then describe the change"
                onClick={() => setInspectMode((v) => !v)}
              >
                <MousePointer2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">{inspectMode ? "Inspecting" : "Inspect"}</span>
              </Button>
              <Button
                variant="ghost" size="sm" className="h-8 px-2"
                title={fullscreenPreview ? "Exit fullscreen" : "Fullscreen preview"}
                onClick={() => setFullscreenPreview((v) => !v)}
              >
                {fullscreenPreview ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
          {streaming ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={stopStream}>
              <Square className="h-3.5 w-3.5 fill-current" /> Stop
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-8 px-2" title="Reload preview" onClick={() => setIframeKey((k) => k + 1)}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2" title="Open preview in new tab" onClick={openInNewTab} disabled={!srcDoc}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="sm"
                className={`h-8 px-2 ${(active.snapshots?.length ?? 0) > 0 ? "text-foreground" : "text-muted-foreground"}`}
                title="Version history"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <History className="h-3.5 w-3.5" />
                {(active.snapshots?.length ?? 0) > 0 && (
                  <span className="ml-1 hidden sm:inline text-[10px]">{active.snapshots?.length}</span>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2" title="Fork project" onClick={forkProject}>
                <GitFork className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={exportZip} disabled={fileList.length === 0}>
                <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline text-xs">Download</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Chat / iteration sidebar — always flex on desktop; on mobile shown as bottom sheet via separate bar */}
        <aside className={`${fullscreenPreview && view === "preview" ? "hidden" : "hidden lg:flex"} w-[340px] shrink-0 flex-col border-r border-border/60 bg-card/30`}>
          <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {active.messages.length === 0 && !streaming && (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-xs text-muted-foreground">
                Drafting your first build. Iterations will appear here as a thread.
              </div>
            )}

            <div className="space-y-3">
              {active.messages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {streaming && (
                <StreamingBubble plan={activeStream?.plan} files={Object.keys(activeStream?.files || {})} active={activeStream?.activePath} />
              )}
            </div>
          </div>

          {/* Iteration composer */}
          <div className="border-t border-border/60 bg-card/40 p-3">
            {selectedEl && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 px-2.5 py-1.5">
                <MousePointer2 className="h-3 w-3 shrink-0 text-orange-600 dark:text-orange-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Targeting</div>
                  <div className="truncate font-mono text-[11px] text-foreground">
                    &lt;{selectedEl.tag}&gt;{selectedEl.text ? ` "${selectedEl.text.slice(0, 40)}"` : ""}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEl(null)}
                  className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-orange-500/10"
                  title="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="rounded-xl border border-border/70 bg-background shadow-soft transition focus-within:border-primary/40">
              <textarea
                ref={iterRef}
                value={iterInput}
                onChange={(e) => setIterInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); iterate(iterInput); } }}
                placeholder={selectedEl ? "Describe the change for this element…" : "Refine — e.g. 'add a dark theme toggle and a pricing FAQ'"}
                rows={2}
                disabled={streaming}
                className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <p className="text-[10px] text-muted-foreground">⏎ to send · ⇧⏎ for newline</p>
                <Button size="icon" className="h-7 w-7 rounded-full" onClick={() => iterate(iterInput)} disabled={!iterInput.trim() || streaming}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => iterate(q)}
                  disabled={streaming}
                  className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-card hover:text-foreground disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* File tree (only when in code view) */}
        {view === "code" && (
          <aside className="w-56 shrink-0 border-r border-border/60 bg-card/20">
            <div className="flex h-9 items-center justify-between border-b border-border/60 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Folder className="h-3 w-3" />Files</span>
              <span>{fileList.length}</span>
            </div>
            <div className="overflow-y-auto p-1.5">
              <FileTree files={fileList} active={selectedFile} onSelect={setSelectedFile} />
            </div>
          </aside>
        )}

        {/* Main pane */}
        <main className="relative flex flex-1 min-w-0 flex-col">
          {view === "preview" ? (
            <PreviewPane
              srcDoc={srcDoc}
              iframeKey={iframeKey}
              iframeRef={iframeRef}
              device={device}
              hasFiles={fileList.length > 0}
              onCopyFile={copyFile}
            />
          ) : view === "code" ? (
            <CodePane
              file={selectedFile}
              content={selectedFile ? allFiles[selectedFile] || "" : ""}
              onCopy={copyFile}
              onChange={(next) => {
                if (!selectedFile || !active) return;
                setProjects((all) => all.map((p) => p.id === active.id ? { ...p, files: { ...p.files, [selectedFile]: next }, updatedAt: Date.now() } : p));
              }}
              readOnly={streaming}
            />
          ) : (
            <ConsolePane
              entries={consoleEntries}
              onClear={() => setConsoleEntries([])}
              onFix={fixErrors}
              canFix={!streaming && errorCount > 0}
            />
          )}

          {/* Agent-steps overlay — replaces FirstRunSkeleton so the preview pane is
              never unmounted. Fades over the empty preview while the first build runs,
              disappears the moment the first file is written. */}
          {streaming && fileList.length === 0 && view === "preview" && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-background/95 via-background/90 to-card/80 backdrop-blur-[3px]">
              <AgentStepsOverlay plan={activeStream?.plan} active={activeStream?.activePath} />
            </div>
          )}

          {/* Inline auto-fix banner — surface across any tab while errors exist */}
          {view !== "console" && errorCount > 0 && !streaming && (
            <button
              onClick={fixErrors}
              className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-background px-3.5 py-2 text-xs shadow-card transition hover:border-destructive hover:bg-destructive/5"
              title="Send the latest sandbox errors to Razen and patch them"
            >
              <Wrench className="h-3.5 w-3.5 text-destructive" />
              <span className="font-medium">Fix {errorCount} error{errorCount > 1 ? "s" : ""}</span>
              <span className="text-muted-foreground">· auto-iterate</span>
            </button>
          )}
        </main>

        {/* Version history side panel */}
        {historyOpen && (
          <HistoryPanel
            snapshots={active.snapshots ?? []}
            onClose={() => setHistoryOpen(false)}
            onRestore={restoreSnapshot}
          />
        )}
      </div>

      {/* Mobile iteration bar — visible only below lg breakpoint where the sidebar is hidden.
          Keeps the composer accessible on phones and tablets. */}
      <div className={`lg:hidden ${fullscreenPreview && view === "preview" ? "hidden" : ""} border-t border-border/60 bg-card/40 px-3 py-2`}>
        {streaming ? (
          <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{activeStream?.activePath ? `Writing ${activeStream.activePath}` : (activeStream?.plan ? activeStream.plan.slice(0, 60) + "…" : "Razen is building…")}</span>
            <button onClick={stopStream} className="ml-auto rounded border border-border/70 bg-background px-2 py-1 text-[11px]">Stop</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {selectedEl && (
              <div className="flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/5 px-2 py-1 text-[11px] text-orange-600">
                <MousePointer2 className="h-3 w-3" />
                <span className="max-w-[100px] truncate">&lt;{selectedEl.tag}&gt;</span>
                <button onClick={() => setSelectedEl(null)}><X className="h-3 w-3" /></button>
              </div>
            )}
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 shadow-soft focus-within:border-primary/40">
              <textarea
                value={iterInput}
                onChange={(e) => setIterInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); iterate(iterInput); } }}
                placeholder="Refine or add to this build…"
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                style={{ maxHeight: "80px" }}
              />
              <Button size="icon" className="h-7 w-7 shrink-0 rounded-full" onClick={() => iterate(iterInput)} disabled={!iterInput.trim() || streaming}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryPanel({
  snapshots, onClose, onRestore,
}: {
  snapshots: Snapshot[];
  onClose: () => void;
  onRestore: (s: Snapshot) => void;
}) {
  return (
    <aside className="w-72 shrink-0 border-l border-border/60 bg-card/40">
      <div className="flex h-9 items-center justify-between border-b border-border/60 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><History className="h-3 w-3" />History</span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-3 w-3" /></button>
      </div>
      <div className="overflow-y-auto p-2">
        {snapshots.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No snapshots yet. Razen captures one before each iteration so you can restore an earlier state with one click.
          </p>
        ) : (
          <div className="space-y-1">
            {snapshots.map((s) => (
              <button
                key={s.ts}
                onClick={() => onRestore(s)}
                className="group block w-full rounded-lg border border-border/60 bg-background/60 p-3 text-left transition hover:border-primary/40 hover:bg-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{s.label}</span>
                  <RotateCcw className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {Object.keys(s.files).length} files · {relTime(s.ts)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────────

function BuildLanding({
  tier, projects, onOpen, onDelete, onExitBuild, onStart, promptRef,
}: {
  tier: Tier;
  projects: Project[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onExitBuild: () => void;
  onStart: (prompt: string) => void;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [val, setVal] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(PRESET_GROUPS[0]);
  const visiblePresets = PRESETS.filter((p) => p.group === activeGroup);
  const recent = projects.slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 md:px-8">
        {/* Heading */}
        <div className="relative">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
               style={{ background: "radial-gradient(circle, oklch(0.7 0.18 45 / 0.55), transparent 70%)" }} />
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Hammer className="h-3.5 w-3.5" /> Build · {tier === "elite" ? "Elite" : tier === "pro" ? "Pro" : "Free"}
          </div>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
            Describe it. Ship it.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
            A senior product engineer that designs, codes, and runs — turns a prompt into a real, interactive app
            with a sandboxed live preview. Iterate in plain English. Export as ZIP. Ship today.
          </p>
        </div>

        {/* Prompt entry */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <textarea
            ref={promptRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onStart(val); } }}
            placeholder="A meeting-intelligence SaaS landing page called Quill — Apple-clean aesthetic, working pricing toggle, signup modal, dark mode."
            rows={5}
            className="w-full resize-none bg-transparent px-6 pt-6 pb-2 text-base outline-none placeholder:text-muted-foreground/70 md:text-lg"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-background/40 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1">
                <Sparkles className="h-3 w-3 text-primary" /> Live sandboxed preview
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1">
                <Wand2 className="h-3 w-3 text-primary" /> Iterate in plain English
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1">
                <Download className="h-3 w-3 text-primary" /> Export as ZIP
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={onExitBuild}>Exit Build</Button>
              <Button size="sm" className="h-9 gap-1.5 px-4" onClick={() => onStart(val)} disabled={!val.trim()}>
                <Sparkles className="h-3.5 w-3.5" /> Build it
              </Button>
            </div>
          </div>
        </div>

        {/* Preset groups */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mr-1">Start from</span>
            {PRESET_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  activeGroup === g
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/70 bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePresets.map((p) => (
              <button
                key={p.id}
                onClick={() => onStart(p.prompt)}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 text-left shadow-soft transition hover:border-primary/40 hover:shadow-card"
              >
                <div className={`relative h-24 overflow-hidden bg-gradient-to-br ${p.gradient}`}>
                  <div className="absolute inset-0 opacity-50 mix-blend-overlay" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.6), transparent 60%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.15), transparent 50%)" }} />
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="flex flex-col items-center gap-1 text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]">
                      <p.icon className="h-7 w-7 drop-shadow" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">{p.group}</span>
                    </div>
                  </div>
                  <ChevronRight className="absolute right-3 top-3 h-4 w-4 text-white/80 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="p-4">
                  <div className="font-display text-base leading-snug">{p.label}</div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.prompt}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent projects */}
        {recent.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent builds</p>
              <span className="text-xs text-muted-foreground">{projects.length} total</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/50 transition hover:bg-card hover:shadow-soft">
                  <button onClick={() => onOpen(p.id)} className="block w-full p-4 text-left">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileCode className="h-3 w-3" />
                      {Object.keys(p.files).length} files · {relTime(p.updatedAt)}
                    </div>
                    <div className="mt-2 truncate font-display text-base">{p.title}</div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{p.prompt}</p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm("Delete this build?")) onDelete(p.id); }}
                    className="absolute right-2 top-2 rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-background"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Capability strip */}
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Layout, t: "Real layouts", d: "Multi-section, responsive, designer-grade aesthetics — never naked centered text." },
            { icon: Wand2, t: "Wired contracts", d: "Every CTA opens a working modal. Every link resolves. Forms validate. No dead controls." },
            { icon: Eye, t: "Sandboxed preview", d: "Runs live in an isolated iframe. Console + errors stream back to you." },
            { icon: Download, t: "Yours forever", d: "Export the full project as a ZIP. Pure HTML/CSS/JS — no lock-in, no build step." },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background">
                <c.icon className="h-4 w-4" />
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

function ChatBubble({ msg }: { msg: ChatMsg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-foreground px-3.5 py-2 text-[13px] leading-relaxed text-background">
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3 text-[13px]">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        <span>Razen Build</span>
      </div>
      <div className="mt-1.5 leading-relaxed text-foreground">{msg.plan || msg.content}</div>
      {msg.files && msg.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {msg.files.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              <FileCode className="h-2.5 w-2.5" /> {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Parse the model's plan into 3-6 concrete tasks for the agent task list.
// Splits on sentence/clause boundaries and verb-led phrases.
function planToTasks(plan: string | undefined): string[] {
  if (!plan) return [];
  // Try numbered or bulleted lists first.
  const listMatch = plan.match(/(?:^|\n)\s*[-*•0-9]+[.)\s]+([^\n]+)/g);
  if (listMatch && listMatch.length >= 2) {
    return listMatch
      .map((m) => m.replace(/^[\s\-*•0-9.)]+/, "").trim())
      .filter((s) => s.length > 5 && s.length < 120)
      .slice(0, 6);
  }
  // Fall back to splitting on commas / sentences.
  const parts = plan.split(/[.;,]\s+/).map((p) => p.trim()).filter((p) => p.length > 8 && p.length < 100);
  return parts.slice(0, 5);
}

function StreamingBubble({ plan, files, active }: { plan?: string; files: string[]; active?: string | null }) {
  // Surface a structured agent timeline so the user can see what's happening
  // — design → wire → ship — instead of a single "loading" bubble.
  const stage = !plan ? "design" : files.length === 0 && !active ? "design" : active ? "wire" : "polish";
  const stages: { key: string; label: string; sub: string; icon: typeof Brain }[] = [
    { key: "design", label: "Designing", sub: "Concept · aesthetic · structure", icon: Brain },
    { key: "wire",   label: "Wiring",    sub: "Layout · components · interactions", icon: Workflow },
    { key: "polish", label: "Polishing", sub: "States · responsiveness · finish", icon: Sparkles },
  ];
  const stageIdx = stages.findIndex((s) => s.key === stage);
  const tasks = planToTasks(plan);
  // Approximate progress per task: completed if a related file has been emitted.
  const completedRatio = tasks.length === 0 ? 0 : Math.min(1, files.length / Math.max(tasks.length, 3));
  const tasksDone = Math.floor(completedRatio * tasks.length);
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-soft">
      <div className="flex items-center gap-1.5 border-b border-primary/15 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Razen agent · live
      </div>
      <div className="px-3 py-3 text-[13px]">
        {plan && <div className="leading-relaxed text-foreground">{plan}</div>}
        {/* Stage rail */}
        <div className="mt-3 flex items-stretch gap-1.5">
          {stages.map((s, i) => {
            const Active = s.icon;
            const done = i < stageIdx;
            const current = i === stageIdx;
            return (
              <div
                key={s.key}
                className={`flex-1 rounded-lg border px-2 py-1.5 transition ${
                  current
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : done
                    ? "border-primary/20 bg-background/60 text-foreground/80"
                    : "border-border/50 bg-background/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {done ? <Check className="h-3 w-3 text-primary" /> : current ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Active className="h-3 w-3" />}
                  <span className="text-[11px] font-semibold">{s.label}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight opacity-80">{s.sub}</p>
              </div>
            );
          })}
        </div>
        {/* Agent task list — parsed from plan, checked off as files complete */}
        {tasks.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/40 bg-background/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ListTodo className="h-3 w-3" /> Tasks · {tasksDone}/{tasks.length}
            </div>
            <div className="space-y-1.5">
              {tasks.map((t, i) => {
                const done = i < tasksDone;
                const current = i === tasksDone && !!active;
                return (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    {done ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : current ? (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <div className="mt-1 h-3 w-3 shrink-0 rounded-full border border-border/60" />
                    )}
                    <span className={`leading-relaxed ${done ? "line-through opacity-60" : current ? "text-foreground" : "text-muted-foreground"}`}>
                      {t}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* File trail */}
        {(files.length > 0 || active) && (
          <div className="mt-3 space-y-1">
            {files.map((f) => (
              <div key={f} className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                <Check className="h-3 w-3 text-primary" />
                <span className="truncate">{f}</span>
              </div>
            ))}
            {active && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="truncate">writing {active}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Non-destructive agent steps overlay for first build — shown OVER the preview
// pane so the iframe is never unmounted. Disappears as soon as the first file appears.
function AgentStepsOverlay({ plan, active }: { plan?: string; active?: string | null }) {
  const stages = [
    { label: "Planning architecture", icon: Brain },
    { label: "Writing files", icon: FileCode },
    { label: "Wiring interactions", icon: Workflow },
  ] as const;
  const stageIdx = !plan ? 0 : active ? 1 : 2;
  return (
    <div className="w-full max-w-md px-4 text-center">
      {/* Animated icon */}
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-foreground text-background shadow-card">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
      <h3 className="mt-5 font-display text-2xl">Building…</h3>
      {plan ? (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{plan}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Razen is planning the architecture and visual direction…</p>
      )}
      {active && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs font-mono shadow-soft">
          <FileCode className="h-3 w-3 text-primary" />
          writing <span className="text-foreground">{active}</span>
        </div>
      )}
      {/* Stage rail */}
      <div className="mt-6 flex items-stretch gap-2">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const done = i < stageIdx;
          const current = i === stageIdx;
          return (
            <div
              key={s.label}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border p-2.5 transition ${
                current ? "border-primary/40 bg-primary/10" : done ? "border-primary/20 bg-background/60" : "border-border/50 bg-background/30"
              }`}
            >
              {done ? (
                <Check className="h-4 w-4 text-primary" />
              ) : current ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Icon className={`h-4 w-4 ${current ? "text-primary" : "text-muted-foreground"}`} />
              )}
              <span className={`text-center text-[10px] leading-tight ${current ? "font-semibold text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FirstRunSkeleton({ plan, active }: { plan?: string; active?: string | null }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-background to-card/40 p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-foreground text-background">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <h3 className="mt-5 font-display text-2xl">Drafting your build</h3>
        {plan ? (
          <p className="mt-2 text-sm text-muted-foreground">{plan}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Razen is planning the architecture and visual direction…</p>
        )}
        {active && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-mono">
            <FileCode className="h-3 w-3 text-primary" />
            writing <span className="text-foreground">{active}</span>
          </div>
        )}
        <div className="mt-8 space-y-2">
          {["Designing layout", "Wiring components", "Polishing"].map((s, i) => (
            <div key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full bg-primary/70 ${i === 0 ? "w-full" : i === 1 ? "w-2/3" : "w-1/4"} animate-pulse`} />
              </div>
              <span className="w-24 text-left">{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  srcDoc, iframeKey, iframeRef, device, hasFiles, onCopyFile,
}: {
  srcDoc: string;
  iframeKey: number;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  device: "desktop" | "tablet" | "mobile";
  hasFiles: boolean;
  onCopyFile: () => void;
}) {
  if (!hasFiles || !srcDoc) {
    return (
      <div className="flex flex-1 items-center justify-center bg-card/30 text-sm text-muted-foreground">
        <div className="text-center">
          <Eye className="mx-auto h-6 w-6 opacity-50" />
          <p className="mt-3">No preview yet — generation in progress.</p>
        </div>
      </div>
    );
  }
  const widths: Record<typeof device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" };
  return (
    <div className="flex flex-1 items-stretch justify-center overflow-auto bg-[radial-gradient(circle_at_top,_var(--color-card),transparent_80%)] p-2 md:p-4">
      <div className="relative w-full" style={{ maxWidth: widths[device] }}>
        <iframe
          key={iframeKey}
          ref={iframeRef}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
          title="Preview"
          className="block h-full w-full rounded-xl border border-border/70 bg-white shadow-card"
          style={{ minHeight: "calc(100vh - 7rem)" }}
        />
      </div>
    </div>
  );
}

function CodePane({
  file, content, onCopy, onChange, readOnly,
}: {
  file: string | null;
  content: string;
  onCopy: () => void;
  onChange: (next: string) => void;
  readOnly: boolean;
}) {
  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a file from the tree.
      </div>
    );
  }
  const lang = languageOf(file);
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex h-9 items-center justify-between border-b border-border/60 bg-card/40 px-3 text-xs">
        <div className="flex items-center gap-2 font-mono text-muted-foreground">
          <FileCode className="h-3 w-3" /> {file}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{lang}</span>
          <span className="text-[10px]">{(content.length / 1024).toFixed(1)} KB</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCopy}>
          <Copy className="h-3 w-3 mr-1" /> Copy
        </Button>
      </div>
      <div className="flex-1 min-h-0 bg-[#1e1e1e]">
        <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Loading editor…</div>}>
          <MonacoEditor
            height="100%"
            value={content}
            language={lang}
            theme="vs-dark"
            onChange={(v) => onChange(v ?? "")}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              lineNumbers: "on",
              wordWrap: "on",
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              renderLineHighlight: "gutter",
              tabSize: 2,
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

function ConsolePane({ entries, onClear, onFix, canFix }: {
  entries: { kind: string; msg: string; ts: number }[];
  onClear: () => void;
  onFix: () => void;
  canFix: boolean;
}) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex h-9 items-center justify-between border-b border-border/60 bg-card/40 px-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Terminal className="h-3 w-3" /> Sandbox console · {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </div>
        <div className="flex items-center gap-1">
          {canFix && (
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onFix}>
              <Wrench className="h-3 w-3" /> Fix errors
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClear}><X className="h-3 w-3 mr-1" />Clear</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[#0a0a0a] p-3 font-mono text-[12px] leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No console activity. Errors and console.log calls from the preview will appear here.</p>
        ) : entries.map((e, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="mt-0.5 shrink-0 text-[10px] text-neutral-500">{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
              e.kind === "error" ? "bg-destructive/30 text-destructive-foreground" :
              e.kind === "warn"  ? "bg-yellow-500/20 text-yellow-200" :
                                   "bg-neutral-800 text-neutral-300"
            }`}>{e.kind}</span>
            <span className={`whitespace-pre-wrap break-all ${e.kind === "error" ? "text-red-300" : e.kind === "warn" ? "text-yellow-200" : "text-neutral-200"}`}>
              {e.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileTree({ files, active, onSelect }: { files: string[]; active: string | null; onSelect: (p: string) => void }) {
  // Group by folder
  const tree: Record<string, string[]> = {};
  files.forEach((p) => {
    const parts = p.split("/");
    if (parts.length === 1) { tree["."] = tree["."] || []; tree["."].push(p); }
    else {
      const dir = parts.slice(0, -1).join("/");
      tree[dir] = tree[dir] || [];
      tree[dir].push(p);
    }
  });
  const dirs = Object.keys(tree).sort();
  return (
    <div className="space-y-2">
      {dirs.map((dir) => (
        <div key={dir}>
          {dir !== "." && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-muted-foreground">
              <FolderOpen className="h-3 w-3" /> {dir}
            </div>
          )}
          <div className="space-y-px">
            {tree[dir].sort(filePathSort).map((p) => {
              const name = p.split("/").pop() || p;
              const isActive = active === p;
              return (
                <button
                  key={p}
                  onClick={() => onSelect(p)}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] font-mono transition ${
                    isActive ? "bg-foreground text-background" : "text-foreground/80 hover:bg-muted"
                  }`}
                >
                  <FileIcon name={name} className="h-3 w-3 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return <FileImage className={className} />;
  if (["md", "txt", "json"].includes(ext)) return <FileText className={className} />;
  return <FileCode className={className} />;
}

function ViewTab({ icon: Icon, label, active, onClick, badge }: {
  icon: typeof Eye; label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">{badge}</span>
      )}
    </button>
  );
}

function DeviceBtn({ icon: Icon, active, onClick, title }: { icon: typeof Monitor; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-6 w-7 place-items-center rounded-full transition ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  "Add a working dark mode toggle",
  "Make it fully mobile responsive",
  "Add a working signup modal",
  "Polish the typography & spacing",
  "Add a section explaining pricing",
  "Add a subtle animation on scroll",
];

function shortLabel(prompt: string): string {
  const t = prompt.trim().split(/\n/)[0];
  return t.length > 40 ? t.slice(0, 40) + "…" : t || "iteration";
}

function smartTitle(prompt: string): string {
  const m = prompt.match(/(?:build|design|make|create|ship)\s+([a-z0-9 ,'-]{3,40})/i);
  if (m) return cap(m[1].trim());
  const firstSentence = prompt.split(/[.!?\n]/)[0].trim();
  return cap((firstSentence.length > 50 ? firstSentence.slice(0, 50) + "…" : firstSentence) || "Untitled build");
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function relTime(t: number): string {
  const d = Date.now() - t;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function prettyModel(id: string): string {
  if (id.includes("gemini-3-flash")) return "Gemini 3 Flash";
  if (id.includes("gemini-2")) return "Gemini 2";
  if (id.includes("gpt")) return id.toUpperCase();
  return id;
}

function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html": case "htm": return "html";
    case "css": return "css";
    case "js": case "mjs": return "javascript";
    case "ts": return "typescript";
    case "tsx": return "typescript";
    case "jsx": return "javascript";
    case "json": return "json";
    case "md": return "markdown";
    case "svg": case "xml": return "xml";
    default: return "plaintext";
  }
}

function filePathSort(a: string, b: string): number {
  // index.html first, then other html, then css, then js, then others; alpha within group.
  const rank = (p: string) => {
    if (p === "index.html") return 0;
    if (p.endsWith(".html")) return 1;
    if (p.endsWith(".css")) return 2;
    if (p.endsWith(".js") || p.endsWith(".mjs")) return 3;
    if (p.endsWith(".json")) return 4;
    return 5;
  };
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

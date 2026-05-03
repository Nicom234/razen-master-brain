import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Search, PenTool, ListChecks, Code2, Quote, Check, Minus, Brain, Eye, FileCode, Hammer, Sparkles, Wand2, Download, Layers, Terminal, Loader2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Razen — The AI employee" },
      { name: "description", content: "Razen is the AI employee that researches, writes, plans, and builds — the work of a full team, delivered in one chat." },
      { property: "og:title", content: "Razen — The AI employee" },
      { property: "og:description", content: "Research. Write. Plan. Build. The work of a full team, in one chat." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <Marquee />
      <Modes />
      <BuildShowcase />
      <ShippedGallery />
      <Demo />
      <Tiers />
      <Compare />
      <Proof />
      <CTA />
      <Footer />
    </div>
  );
}

function Tiers() {
  const [annual, setAnnual] = useState(true);
  const tiers = [
    {
      name: "Free",
      price: "£0",
      cadence: "forever",
      tagline: "Try the four modes. Hit the ceiling fast.",
      cta: { label: "Start free", to: "/signup" as const },
      tone: "card",
      limits: "25 credits / day · Quick scan only · No memory",
      features: [
        "All four modes — Research, Write, Plan, Build",
        "Quick scan research depth (3 sub-questions, ~1k word memos)",
        "Public share links and Markdown export",
        "Web search with cited sources",
      ],
      missing: [
        "No long-term memory",
        "No file uploads (PDFs, images)",
        "Build Studio basics only — no fork, no snapshots",
        "No deep research depth",
      ],
    },
    {
      name: "Pro",
      price: annual ? "£23.99" : "£29.99",
      cadence: "/mo",
      annualNote: annual ? "billed yearly · save £72/yr" : "billed monthly",
      tagline: "For operators using Razen as their daily driver.",
      cta: { label: "Upgrade to Pro", to: "/pricing" as const },
      tone: "primary",
      badge: "Most popular",
      limits: "400 credits/mo · Memory · Build Studio · Files",
      features: [
        "400 credits / month — generous monthly pool, no daily reset",
        "Long-term memory — Razen remembers your role, projects, voice",
        "Full Build Studio: live preview, click-to-edit, ZIP export, fork, version history",
        "Deep research depth (6 sub-questions, ~3.5k word memos)",
        "File uploads — 30MB PDFs, screenshots, contracts",
        "Priority routing — first-class queue, faster responses",
        "Plan workspace: Kanban + Calendar + AI Monday standup",
      ],
      missing: [],
    },
    {
      name: "Elite",
      price: annual ? "£79.99" : "£99.99",
      cadence: "/mo",
      annualNote: annual ? "billed yearly · save £240/yr" : "billed monthly",
      tagline: "Built for the work that ships products and changes outcomes.",
      cta: { label: "Go Elite", to: "/pricing" as const },
      tone: "dark",
      limits: "1,500 credits/mo · Frontier models · Heavy depth",
      features: [
        "1,500 credits / month — capacity for sustained heavy work",
        "Frontier reasoning routed automatically — top-tier models for heavy tasks",
        "Heavy research depth: 8 parallel sub-questions, ~7k word analyst memos",
        "Build Studio: command palette, larger context, version forks, deeper iteration",
        "Plan workspace: AI risk analysis, dependency mapping, decision log",
        "Write: full voice library, unlimited ghost-text autocomplete",
        "Direct founder Slack · early access to new modes",
      ],
      missing: [],
    },
  ];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Pro &amp; Elite</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">Unlock the full team.</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Free covers the day-to-day. Pro and Elite add depth, memory, and the
            studio-grade tools that turn Razen into an actual hire.
          </p>
        </div>

        {/* Billing toggle — pure conversion lever; defaults to annual to anchor savings. */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/60 p-1 shadow-soft">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                !annual ? "bg-foreground text-background shadow-soft" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                annual ? "bg-foreground text-background shadow-soft" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {tiers.map((t, i) => {
            const isPrimary = t.tone === "primary";
            const isDark = t.tone === "dark";
            return (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.07 }}
                className={`relative flex flex-col rounded-2xl border p-7 shadow-soft ${
                  isPrimary
                    ? "border-primary/50 bg-card shadow-card ring-1 ring-primary/30"
                    : isDark
                    ? "border-foreground/15 bg-foreground text-background"
                    : "border-border/70 bg-card/70"
                }`}
              >
                {t.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                    {t.badge}
                  </span>
                )}
                <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${isDark ? "text-background/60" : "text-muted-foreground"}`}>
                  {t.name}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-5xl">{t.price}</span>
                  {t.cadence && <span className={`text-sm ${isDark ? "text-background/60" : "text-muted-foreground"}`}>{t.cadence}</span>}
                </div>
                {("annualNote" in t && t.annualNote) ? (
                  <p className={`mt-1 text-[11px] font-medium ${isDark ? "text-primary" : isPrimary ? "text-primary" : "text-muted-foreground"}`}>{t.annualNote}</p>
                ) : null}
                <p className={`mt-2 text-sm ${isDark ? "text-background/70" : "text-muted-foreground"}`}>{t.tagline}</p>

                {/* Quick limits/highlights badge */}
                <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                  isDark ? "border-primary/40 bg-primary/10 text-primary" : isPrimary ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-background/60 text-muted-foreground"
                }`}>
                  {t.limits}
                </div>

                <ul className="mt-5 space-y-2.5 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${isDark ? "text-primary" : isPrimary ? "text-primary" : "text-foreground/70"}`} />
                      <span className={isDark ? "text-background/85" : "text-foreground/85"}>{f}</span>
                    </li>
                  ))}
                </ul>

                {t.missing.length > 0 && (
                  <ul className={`mt-3 space-y-1.5 text-[12px] ${isDark ? "text-background/55" : "text-muted-foreground"}`}>
                    {t.missing.map((m) => (
                      <li key={m} className="flex items-start gap-2.5">
                        <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="opacity-75">{m}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-8 pt-4">
                  <Link to={t.cta.to} className="block">
                    <Button
                      className={`h-11 w-full rounded-full text-sm font-medium ${
                        isDark
                          ? "bg-background text-foreground hover:bg-background/90"
                          : isPrimary
                          ? ""
                          : "bg-foreground text-background hover:bg-foreground/90"
                      }`}
                    >
                      {t.cta.label} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Specific use-case proof */}
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { who: "Founders & operators", w: "Pro", reason: "Ship products faster — Build Studio + memory + deep research." },
            { who: "Analysts & researchers", w: "Elite", reason: "8-source parallel research, ~7k word memos with citations and contrarian analysis." },
            { who: "Marketing & content", w: "Pro", reason: "Voice library, ghost-text autocomplete, version history — built to replace Notion AI." },
          ].map((c) => (
            <div key={c.who} className="rounded-xl border border-border/70 bg-card/50 p-4 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{c.who}</div>
              <div className="mt-1 font-semibold text-foreground">→ {c.w}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{c.reason}</p>
            </div>
          ))}
        </div>

        {/* Trust strip — concrete proofs to remove last-mile friction. */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Cancel anytime</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Stripe-secured payments</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Your data isn't used to train models</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />Export your work as Markdown or ZIP</span>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Team plans and annual invoicing available — <Link to="/pricing" className="underline hover:text-foreground">see pricing</Link>.
        </p>
      </div>
    </section>
  );
}

const ROTATIONS = ["analyst.", "strategist.", "writer.", "engineer.", "chief of staff."];

function Hero() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % ROTATIONS.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grain" />
      {/* Big editorial gradient orb */}
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
           style={{ background: "radial-gradient(circle, oklch(0.7 0.18 45 / 0.55), transparent 70%)" }} />

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 md:pt-32 lg:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground shadow-soft md:mx-auto md:flex"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          New · Build Studio with click-to-edit and version history
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto mt-7 max-w-5xl text-center font-display text-[44px] leading-[0.98] tracking-tight md:text-7xl lg:text-[96px]"
        >
          Hire your AI{" "}
          <span className="relative inline-block align-baseline">
            <AnimatePresence mode="wait">
              <motion.span
                key={ROTATIONS[i]}
                initial={{ opacity: 0, y: 22, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -22, filter: "blur(6px)" }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="italic"
                style={{ color: "var(--color-primary)" }}
              >
                {ROTATIONS[i]}
              </motion.span>
            </AnimatePresence>
          </span>
          <br />
          <span className="text-muted-foreground">All in one chat.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-7 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground md:text-xl"
        >
          Razen researches, writes, plans, and builds — the work of a full team,
          delivered in one chat. Outcomes, not chatter.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Link to="/signup">
            <Button size="lg" className="h-12 rounded-full px-7 text-base font-medium shadow-soft">
              Start free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="h-12 rounded-full border-border/80 bg-card/40 px-7 text-base">
              See pricing
            </Button>
          </Link>
        </motion.div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Free forever plan · No credit card · Cancel any time
        </p>
      </div>
    </section>
  );
}

function Marquee() {
  // Honest comparative framing — what Razen replaces, not who endorses it.
  const replaces = [
    { name: "ChatGPT Plus", note: "Q&A + memory" },
    { name: "Perplexity Pro", note: "research + citations" },
    { name: "Notion AI", note: "writing + ghost-text" },
    { name: "Lovable / v0", note: "Build studio" },
    { name: "Linear AI", note: "planning + Kanban" },
  ];
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Replaces a stack of subscriptions — one bill, one chat
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
          {replaces.map((r) => (
            <div key={r.name} className="inline-flex items-baseline gap-1.5">
              <span className="font-display text-sm tracking-[0.05em] text-foreground/70">{r.name}</span>
              <span className="text-[10px] text-muted-foreground">· {r.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Modes() {
  const items = [
    { icon: Search, title: "Research", body: "Decomposes a question into parallel sub-questions, searches the web, streams a live agent timeline, and synthesises a cited analyst memo. Then suggests where to dig next.", badge: "Perplexity-grade" },
    { icon: PenTool, title: "Write", body: "Inline ghost-text autocomplete (Tab to accept). Focus mode dims everything but the current paragraph. Version history with one-click restore. Bubble-menu rewrites in any voice.", badge: "Notion-AI-grade" },
    { icon: ListChecks, title: "Plan", body: "Outline · Kanban · Calendar views with owners, priorities, and due dates. Drag-and-drop, AI Monday standup memo, and a definition of done that actually means something.", badge: "Linear-grade" },
    { icon: Code2, title: "Build", body: "A real product studio. Live sandboxed preview, multi-file projects, file tree, error console, plain-English iteration, fullscreen review, ZIP export.", badge: "Lovable-grade" },
  ];
  return (
    <section>
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Four specialists. One brain.</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">A team in a tab.</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Switch modes inside the same chat. Razen picks the right brain for the job, every time.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-7 shadow-soft transition hover:shadow-card"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {it.badge}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShippedGallery() {
  // Illustrative archetypes — what Razen Build can produce from a single prompt.
  // No fake users, no fake timestamps. Each card is labelled as an example.
  const items = [
    { label: "SaaS landing page", grad: "from-orange-200 via-amber-100 to-rose-100", emoji: "✨", title: "Quill", sub: "Meeting AI", prompt: "Landing page for an AI meeting assistant" },
    { label: "Glass dashboard", grad: "from-slate-900 via-indigo-900 to-purple-900", emoji: "📊", title: "Lumen", sub: "Revenue dashboard", prompt: "Glassy SaaS revenue dashboard" },
    { label: "Kanban board", grad: "from-sky-100 via-cyan-100 to-emerald-100", emoji: "📋", title: "Drift", sub: "Sprint board", prompt: "Linear-style Kanban for engineering sprints" },
    { label: "Boutique store", grad: "from-rose-100 via-orange-100 to-yellow-100", emoji: "🛍️", title: "Hesperide", sub: "Spring collection", prompt: "Boutique skincare e-commerce" },
    { label: "Habit tracker", grad: "from-violet-200 via-pink-200 to-rose-200", emoji: "🌱", title: "Streak", sub: "Daily habits", prompt: "Minimal habit tracker with streaks" },
    { label: "Editorial portfolio", grad: "from-stone-200 via-rose-100 to-amber-100", emoji: "📷", title: "Aria Lin", sub: "Selected works", prompt: "Editorial portfolio for a photographer" },
  ];
  return (
    <section className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">What you can build</p>
            <h2 className="mt-2 font-display text-3xl md:text-5xl">From one prompt to a working app.</h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              Examples of the kinds of projects Razen Build produces from a single description. No code, no setup, no deploy step.
            </p>
          </div>
          <Link to="/signup" className="hidden md:block">
            <Button variant="outline" className="h-10 rounded-full border-border/80">
              Try it free <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft transition hover:shadow-card hover:border-primary/40"
            >
              <div className={`relative h-32 bg-gradient-to-br ${it.grad}`}>
                <div className="absolute inset-0 mix-blend-overlay opacity-50" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.6), transparent 60%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.15), transparent 50%)" }} />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]">
                    <div className="text-3xl">{it.emoji}</div>
                    <div className="mt-1 font-display text-base">{it.title}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] opacity-90">{it.sub}</div>
                  </div>
                </div>
                <span className="absolute left-3 top-3 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  {it.label}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-foreground/70 backdrop-blur-sm">
                  Example
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate text-[11px] text-muted-foreground">Prompt</div>
                  <div className="truncate text-xs font-medium text-foreground">{it.prompt}</div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2 py-1 text-[10px] font-medium text-foreground/80 transition group-hover:bg-foreground group-hover:text-background">
                  Try <ArrowRight className="h-2.5 w-2.5" />
                </span>
              </div>
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Examples of Razen Build outputs. <Link to="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">Build yours →</Link>
        </p>
      </div>
    </section>
  );
}

function BuildShowcase() {
  return (
    <section className="relative overflow-hidden border-t border-border/60 bg-foreground text-background">
      <div className="pointer-events-none absolute -left-32 top-0 h-[32rem] w-[32rem] rounded-full opacity-20 blur-3xl"
           style={{ background: "radial-gradient(circle, oklch(0.7 0.18 45 / 0.9), transparent 70%)" }} />
      <div className="pointer-events-none absolute right-[-10rem] bottom-[-10rem] h-[28rem] w-[28rem] rounded-full opacity-15 blur-3xl"
           style={{ background: "radial-gradient(circle, oklch(0.85 0.22 80 / 0.6), transparent 70%)" }} />

      <div className="relative mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Left: positioning */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-background/70">
              <Hammer className="h-3 w-3" /> Build Studio
            </div>
            <h2 className="mt-5 font-display text-5xl leading-[1.02] md:text-6xl">
              Lovable, bolt.new, v0 — <span className="italic text-primary">in your chat.</span>
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-background/70">
              A real product studio. Describe an app — Razen designs it, codes it, and runs it in a
              sandboxed live preview. Iterate in plain English. Every button wired, every form validated.
              Export the whole project as a ZIP. No build step. No lock-in.
            </p>

            <ul className="mt-8 grid gap-3">
              {[
                { i: Eye, t: "Live sandboxed preview", d: "See your app run as it streams in. Errors and console output stream back to you." },
                { i: FileCode, t: "Multi-file projects", d: "HTML, CSS, JS — split into clean modules. View the file tree, edit any file inline." },
                { i: Wand2, t: "Iterate in plain English", d: "“Add a dark mode toggle.” “Polish the typography.” Razen edits — and only re-emits what changed." },
                { i: Download, t: "Yours forever", d: "Download as a ZIP. Pure HTML/CSS/JS. Drop it on Vercel, Netlify, or your own server." },
              ].map((b) => (
                <li key={b.t} className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background/10 text-background/80">
                    <b.i className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{b.t}</div>
                    <p className="text-sm text-background/65">{b.d}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button size="lg" className="h-12 rounded-full bg-background px-7 text-base text-foreground hover:bg-background/90">
                  Try Build free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/features">
                <Button size="lg" variant="outline" className="h-12 rounded-full border-background/30 bg-transparent px-7 text-base text-background hover:bg-background/10 hover:text-background">
                  See capabilities
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: window mockup of the studio */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative overflow-hidden rounded-2xl border border-background/15 bg-foreground/95 shadow-2xl"
          >
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-background/10 bg-background/[0.04] px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-background/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-background/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-background/15" />
              </div>
              <div className="ml-2 truncate font-mono text-[11px] text-background/60">razen / build · quill-landing</div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-background/20 px-2 py-0.5 text-[10px] text-background/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
              </span>
            </div>
            {/* Tabs row */}
            <div className="flex items-center gap-1 border-b border-background/10 bg-background/[0.02] px-3 py-1.5 text-[11px]">
              <span className="rounded-full bg-background/10 px-2 py-0.5 text-background/90 inline-flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</span>
              <span className="px-2 py-0.5 text-background/50 inline-flex items-center gap-1"><Code2 className="h-3 w-3" /> Code</span>
              <span className="px-2 py-0.5 text-background/50 inline-flex items-center gap-1"><Terminal className="h-3 w-3" /> Console</span>
              <span className="ml-auto font-mono text-background/40">7 files · gemini 3 flash</span>
            </div>
            {/* Body: file tree + faux preview */}
            <div className="grid grid-cols-[140px_1fr] divide-x divide-background/10">
              <div className="space-y-1 bg-background/[0.02] p-2 text-[11px] font-mono text-background/70">
                <div className="flex items-center gap-1.5"><FileCode className="h-3 w-3 text-primary" /> index.html</div>
                <div className="flex items-center gap-1.5 opacity-70"><FileCode className="h-3 w-3" /> styles.css</div>
                <div className="flex items-center gap-1.5 opacity-70"><FileCode className="h-3 w-3" /> main.js</div>
                <div className="flex items-center gap-1.5 opacity-70"><FileCode className="h-3 w-3" /> store.js</div>
                <div className="flex items-center gap-1.5 opacity-50 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> ui.js
                </div>
              </div>
              <div className="bg-white p-4 text-foreground">
                {/* Faux landing page mock */}
                <div className="rounded-md border border-foreground/10 bg-card/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-background font-display text-[10px]">Q</span>
                      <span className="text-[10px] font-medium tracking-wide">QUILL</span>
                    </div>
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[8px] text-background">Try free</span>
                  </div>
                  <div className="mt-3 font-display text-sm leading-tight">Meeting intel,<br />without the noise.</div>
                  <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">Records, summarises, and actions every meeting your team runs.</p>
                  <div className="mt-2 flex gap-1">
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[8px] text-background">Get started</span>
                    <span className="rounded-full border border-foreground/20 px-2 py-0.5 text-[8px]">Watch demo</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <div className="rounded-sm bg-muted/60 p-1.5 text-[7px] text-muted-foreground">⏺ Live transcripts</div>
                    <div className="rounded-sm bg-muted/60 p-1.5 text-[7px] text-muted-foreground">⚑ Action items</div>
                    <div className="rounded-sm bg-muted/60 p-1.5 text-[7px] text-muted-foreground">∞ Searchable</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center gap-2 border-t border-background/10 bg-background/[0.04] px-3 py-2">
              <span className="font-mono text-[10px] text-background/50">~/quill-landing</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-background/5 px-2 py-1 text-[10px] text-background/70">
                <Sparkles className="h-2.5 w-2.5 text-primary" /> Add a pricing FAQ section
              </span>
              <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">⏎</span>
            </div>
          </motion.div>
        </div>

        {/* Capability strip */}
        <div className="mt-16 grid gap-3 border-t border-background/10 pt-12 sm:grid-cols-2 md:grid-cols-4">
          {[
            { i: Layers, t: "Real layouts", d: "Multi-section, responsive, designer-grade — never naked centred text." },
            { i: Wand2, t: "Wired contracts", d: "Every CTA opens a working modal. Every link resolves. Forms validate." },
            { i: Eye, t: "Sandboxed preview", d: "Runs in an isolated iframe. Console + errors stream back to you." },
            { i: Download, t: "Yours forever", d: "Export the whole project. Pure HTML/CSS/JS. No lock-in." },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-background/15 bg-background/[0.03] p-4">
              <c.i className="h-4 w-4 text-primary" />
              <div className="mt-3 text-sm font-semibold">{c.t}</div>
              <p className="mt-1 text-xs leading-relaxed text-background/60">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section className="border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 md:grid-cols-2 md:items-center md:py-32">
        <div>
          <p className="text-sm font-medium text-primary">How it feels</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl leading-tight">
            Ask once.<br />Get the finished thing.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Most AI tools hand you a draft and walk away. Razen does the searching, the
            structuring, the editing — and hands you something you can actually send.
          </p>
          <ul className="mt-8 space-y-3 text-base">
            {[
              "Sources cited inline. No invented URLs.",
              "Drop in PDFs and images for analysis.",
              "Long-term memory — remembers you across chats.",
              "Per-task pricing. Quick lookups cost 1 credit, deep work costs more.",
            ].map((b) => (
              <li key={b} className="flex items-start gap-3 text-foreground/85">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl border border-border/70 bg-background shadow-card"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
              </div>
              <span className="ml-3 text-xs text-muted-foreground">razen — research mode</span>
            </div>
            <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Example</span>
          </div>
          <div className="space-y-4 p-7 text-sm leading-relaxed">
            <div className="rounded-xl bg-muted px-4 py-3 text-foreground/90">
              Summarise the latest open-source AI release notes from this week.
            </div>
            <div className="space-y-2 text-muted-foreground">
              <p>↳ Searching across release pages and dev blogs… grouping by project…</p>
            </div>
            <div className="space-y-3">
              <p className="font-medium text-foreground">Findings:</p>
              <ul className="space-y-2 text-foreground/85">
                <li>New mid-tier open model with ~32k context, MIT-licensed <span className="citation-pill">[1]</span></li>
                <li>Major framework adds streaming tool-use and structured outputs <span className="citation-pill">[2]</span></li>
                <li>Inference engine ships 2× throughput on consumer GPUs <span className="citation-pill">[3]</span></li>
              </ul>
              <p className="text-xs text-muted-foreground italic">Illustrative example · sources cited inline · 2 credits</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Compare() {
  const rows = [
    { f: "Auto-routes to the best model per task", razen: true, chatgpt: false, claude: false },
    { f: "Live web research with citations", razen: true, chatgpt: true, claude: false },
    { f: "Long-term memory across chats", razen: true, chatgpt: true, claude: false },
    { f: "Mode-specific system prompts", razen: true, chatgpt: false, claude: false },
    { f: "Per-task pricing — pay for what you use", razen: true, chatgpt: false, claude: false },
    { f: "Markdown export of any chat", razen: true, chatgpt: false, claude: false },
    { f: "Public share links for any reply", razen: true, chatgpt: false, claude: false },
    { f: "Starting price", razen: "Free", chatgpt: "$20/mo", claude: "$20/mo" },
  ];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Why Razen</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">Built like the others wish they were.</h2>
          <p className="mt-5 text-muted-foreground">One chat that thinks like a team — instead of a chatbot pretending to be one.</p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-soft">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-0 border-b border-border/60 bg-card/80 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-6">
            <div>Feature</div>
            <div className="text-center text-foreground">Razen</div>
            <div className="text-center">ChatGPT Plus</div>
            <div className="text-center">Claude Pro</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.f} className={`grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-0 px-4 py-3.5 text-sm sm:px-6 ${i % 2 ? "bg-background/50" : ""}`}>
              <div className="text-foreground/85">{r.f}</div>
              <Cell value={r.razen} highlight />
              <Cell value={r.chatgpt} />
              <Cell value={r.claude} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cell({ value, highlight = false }: { value: boolean | string; highlight?: boolean }) {
  if (typeof value === "string") {
    return <div className={`text-center text-sm ${highlight ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{value}</div>;
  }
  return (
    <div className="flex justify-center">
      {value
        ? <Check className={`h-5 w-5 ${highlight ? "text-primary" : "text-foreground/60"}`} />
        : <Minus className="h-5 w-5 text-muted-foreground/40" />}
    </div>
  );
}

function Proof() {
  // Honest value-prop strip — concrete capability claims, no fabricated testimonials.
  const points = [
    {
      title: "One bill instead of four",
      body: "Pro at £29.99/mo lands below ChatGPT Plus + Notion AI + Perplexity Pro combined. One subscription, four specialist modes.",
    },
    {
      title: "Cited research, no hallucinated URLs",
      body: "Research mode runs live web search and links every claim back to a real source. You can click each citation and verify it.",
    },
    {
      title: "From plan to working app in one chat",
      body: "Sketch a plan in Plan mode, then describe the app in Build. Sandboxed live preview, exportable as a ZIP. Yours forever.",
    },
  ];
  return (
    <section className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Why Razen</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">From a bookmark folder of tools to one chat.</h2>
          <p className="mt-5 text-muted-foreground">
            Specialist modes, real citations, and a Build studio that exports a downloadable project.
            No tab juggling, no copy-paste between tools.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {points.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="rounded-2xl border border-border/70 bg-background/70 p-7 shadow-soft"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background">
                <Quote className="h-4 w-4" />
              </div>
              <h3 className="mt-5 font-display text-lg leading-tight">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="border-t border-border/60 bg-foreground text-background">
      <div className="relative mx-auto max-w-4xl overflow-hidden px-5 py-28 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-background/30 to-transparent" />
        <Brain className="mx-auto h-10 w-10 text-background/40" />
        <h2 className="mt-6 font-display text-5xl leading-[1.02] md:text-7xl">
          Stop juggling tabs.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-background/70">
          Hire Razen. The work of a full team — research, writing, planning, building — in one chat.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/signup">
            <Button size="lg" className="h-12 rounded-full bg-background px-7 text-base text-foreground hover:bg-background/90">
              Get started free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="h-12 rounded-full border-background/30 bg-transparent px-7 text-base text-background hover:bg-background/10 hover:text-background">
              View pricing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded bg-foreground text-background font-display text-xs">R</div>
          <span>© {new Date().getFullYear()} Razen AI</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link to="/features" className="hover:text-foreground">Capabilities</Link>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/changelog" className="hover:text-foreground">Changelog</Link>
          <Link to="/shortcuts" className="hover:text-foreground">Shortcuts</Link>
          <Link to="/models" className="hover:text-foreground">Models</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

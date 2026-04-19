import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Globe, Code2, Zap, Check, Sparkles, Quote, Star } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Razen AI — One agent. Every task." },
      { name: "description", content: "The unified AI agent that researches the live web, writes and runs code, and finishes long-horizon work — without you babysitting tool pickers." },
      { property: "og:title", content: "Razen AI — One agent. Every task." },
      { property: "og:description", content: "The unified AI agent that finishes work, not just chats about it." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen overflow-hidden">
      <Nav />
      <Hero />
      <Logos />
      <Showcase />
      <Features />
      <Compare />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  );
}

/* ---------------------------------- HERO ---------------------------------- */
function Hero() {
  return (
    <section className="relative">
      {/* Layered ambient background */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-50" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-20 md:pt-28 lg:pt-32">
        {/* Status pill */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[11px]"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-primary">Live</span>
          <span className="text-muted-foreground">· master_brain v1 just shipped</span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-7 max-w-4xl font-display text-[44px] leading-[0.98] tracking-tight md:text-7xl lg:text-[88px]"
        >
          One agent.<br />
          <span className="text-muted-foreground">Every</span> task<span className="text-primary">.</span>
        </motion.h1>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          Razen researches the live web, writes and runs code, and finishes
          multi-step work end-to-end. No tool pickers. No mode switching.
          Just outcomes.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Link to="/signup">
            <Button size="lg" className="h-12 rounded-md px-6 text-sm font-semibold pulse-glow">
              Start free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="h-12 rounded-md border-border/80 px-6 text-sm">
              See pricing
            </Button>
          </Link>
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            No card · 5 free messages/day
          </span>
        </motion.div>

        {/* Terminal mock */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="mt-16 overflow-hidden rounded-xl border border-border/80 bg-card/70 shadow-2xl shadow-primary/5 backdrop-blur"
        >
          <div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="ml-3 font-mono text-[11px] text-muted-foreground">razen — master_brain</span>
          </div>
          <div className="space-y-3 p-5 font-mono text-[13px] leading-relaxed md:p-7">
            <p><span className="text-primary">user@razen</span> <span className="text-muted-foreground">~</span> $ research the top 3 ai agent startups raising in 2025, summarize traction</p>
            <p className="text-muted-foreground">→ searching live web · 14 sources · cross-referencing crunchbase…</p>
            <p className="text-muted-foreground">→ executing python notebook · building comparison table…</p>
            <p>
              <span className="text-primary">razen</span> <span className="text-muted-foreground">›</span> Done. Cognition AI ($4B), Adept ($350M acq.), Cohere ($500M).
              <br />
              <span className="text-muted-foreground">  Full report saved · 2,340 tokens · 11 citations</span>
              <span className="terminal-cursor" />
            </p>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40 sm:grid-cols-4"
        >
          {[
            ["12k+", "tasks shipped this week"],
            ["<400ms", "first token latency"],
            ["200k", "token context window"],
            ["99.97%", "uptime · last 90 days"],
          ].map(([v, k]) => (
            <div key={k} className="bg-background/80 p-5">
              <div className="font-display text-3xl text-primary">{v}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* --------------------------------- LOGOS ---------------------------------- */
function Logos() {
  const teams = ["acme", "northwind", "stark.io", "vertex", "halcyon", "lumen", "axiom"];
  return (
    <section className="border-y border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Trusted by operators at fast-moving teams
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {teams.map((t) => (
            <span key={t} className="font-display text-2xl text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- SHOWCASE -------------------------------- */
function Showcase() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-4 py-24 md:py-32">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-mono text-xs text-primary">// the difference</p>
            <h2 className="mt-3 font-display text-4xl leading-tight md:text-6xl">
              Stop assembling tools.<br />
              <span className="text-muted-foreground">Start finishing work.</span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              Most "agents" are a chatbot wrapped around a tool picker.
              You still drive. Razen plans, executes, recovers, and reports —
              one continuous brain across the whole job.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Plans across 100+ steps without losing the thread",
                "Self-recovers from failed actions and dead ends",
                "Cites every fact, ships every artifact",
              ].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="text-foreground/90">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Code-style card */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-2xl bg-primary/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl">
              <div className="border-b border-border/60 bg-background/40 px-5 py-3 font-mono text-[11px] text-muted-foreground">
                task_log.json
              </div>
              <div className="space-y-2 p-5 font-mono text-[12px] leading-relaxed">
                {[
                  ["09:41:02", "received", "build a market map of EU AI startups"],
                  ["09:41:04", "plan", "11 steps · web search → enrich → table → pdf"],
                  ["09:41:18", "exec", "fetched 47 sources · dedup → 23 unique"],
                  ["09:42:09", "exec", "running python · pandas · matplotlib"],
                  ["09:43:31", "recover", "API rate-limited · switched provider"],
                  ["09:44:55", "done", "report.pdf · 12 pages · 38 citations ✓"],
                ].map(([t, k, v]) => (
                  <div key={t as string} className="flex gap-3">
                    <span className="text-muted-foreground">{t}</span>
                    <span className="w-16 text-primary">{k}</span>
                    <span className="text-foreground/90">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- FEATURES -------------------------------- */
function Features() {
  const items = [
    { icon: Brain, title: "Long-horizon reasoning", body: "Plans across hundreds of steps. Holds context. Recovers from failure without losing momentum." },
    { icon: Globe, title: "Live web research", body: "Fresh data, cited sources, no hallucinated URLs. Real browsing, not a stale snapshot." },
    { icon: Code2, title: "Real code execution", body: "Sandboxed runtime writes, runs, debugs. Returns artifacts you can actually use." },
    { icon: Zap, title: "One brain, no friction", body: "No mode switching. No tool picker. Ask once — Razen figures out the rest." },
    { icon: Sparkles, title: "Bring your own model", body: "Use our managed models or plug in Claude, GPT-5, Gemini with your own keys." },
    { icon: Check, title: "Cited & auditable", body: "Every claim sourced. Every action logged. Built for teams that ship." },
  ];
  return (
    <section className="border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-primary">// capabilities</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">Everything you'd build yourself.</h2>
          <p className="mt-4 text-base text-muted-foreground">Bundled. Battle-tested. One subscription.</p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="group relative bg-background/80 p-6 transition hover:bg-card md:p-8">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition group-hover:scale-110">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- COMPARE --------------------------------- */
function Compare() {
  const rows: [string, boolean, boolean, boolean][] = [
    ["Single unified agent", true, false, false],
    ["Live web research", true, true, true],
    ["Real code execution", true, true, false],
    ["Long-horizon reasoning (100+ steps)", true, false, false],
    ["No tool-picker friction", true, false, false],
    ["Bring-your-own model keys", true, false, false],
    ["Cited sources on every claim", true, false, true],
  ];
  const dot = (on: boolean, primary?: boolean) =>
    on ? (
      <Check className={`mx-auto h-4 w-4 ${primary ? "text-primary" : "text-foreground/70"}`} />
    ) : (
      <span className="mx-auto block h-1 w-3 rounded-full bg-muted-foreground/30" />
    );

  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-primary">// honest comparison</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">How Razen stacks up.</h2>
        </div>
        <div className="mt-10 overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/40">
              <tr className="border-b border-border/60">
                <th className="px-5 py-4 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">capability</th>
                <th className="px-5 py-4 text-center font-display text-lg text-primary">Razen</th>
                <th className="px-5 py-4 text-center font-display text-lg text-muted-foreground">Manus</th>
                <th className="px-5 py-4 text-center font-display text-lg text-muted-foreground">Genspark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, r, m, g]) => (
                <tr key={label} className="border-b border-border/40 last:border-0 hover:bg-card/30">
                  <td className="px-5 py-4 text-foreground/90">{label}</td>
                  <td className="px-5 py-4">{dot(r, true)}</td>
                  <td className="px-5 py-4">{dot(m)}</td>
                  <td className="px-5 py-4">{dot(g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ TESTIMONIALS ------------------------------ */
function Testimonials() {
  const quotes = [
    { q: "We replaced three tools and a junior researcher with Razen. It just finishes the work.", a: "Maya Chen", r: "Head of Ops, Vertex" },
    { q: "Finally an agent that doesn't make me babysit a tool picker. Ship-quality output.", a: "Jules Akerman", r: "Founder, Halcyon" },
    { q: "The long-horizon reasoning is the unlock. Genspark felt like a toy after this.", a: "Diego Marín", r: "Eng Lead, Lumen" },
  ];
  return (
    <section className="border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-primary">// signal</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">Operators are switching.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {quotes.map((t) => (
            <figure key={t.a} className="relative rounded-xl border border-border/60 bg-background p-6">
              <Quote className="absolute right-5 top-5 h-6 w-6 text-primary/20" />
              <div className="flex gap-0.5 text-primary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 text-base leading-relaxed text-foreground/90">"{t.q}"</blockquote>
              <figcaption className="mt-5 font-mono text-xs">
                <span className="text-foreground">{t.a}</span>
                <span className="text-muted-foreground"> · {t.r}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- CTA ---------------------------------- */
function CTA() {
  return (
    <section className="relative border-t border-border/60">
      <div className="pointer-events-none absolute inset-0 scanlines opacity-40" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[100px]" />
      <div className="relative mx-auto max-w-3xl px-4 py-28 text-center">
        <h2 className="font-display text-5xl leading-tight md:text-7xl">
          Boot the brain.<br />
          <span className="text-primary">Get to work.</span>
        </h2>
        <p className="mt-5 text-base text-muted-foreground">
          5 free messages every day. Upgrade when you're ready.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/signup">
            <Button size="lg" className="h-12 rounded-md px-7 text-sm font-semibold pulse-glow">
              Start free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="h-12 rounded-md border-border/80 px-7 text-sm">
              See pricing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- FOOTER --------------------------------- */
function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 font-mono text-xs text-muted-foreground md:flex-row">
        <p>© razen.ai · master_brain v1</p>
        <div className="flex gap-5">
          <Link to="/features" className="hover:text-foreground">features</Link>
          <Link to="/pricing" className="hover:text-foreground">pricing</Link>
          <Link to="/login" className="hover:text-foreground">login</Link>
        </div>
      </div>
    </footer>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Search, PenTool, ListChecks, Code2, Quote, Check, Minus, Sparkles, Zap, Brain, Globe } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Razen — The AI employee" },
      { name: "description", content: "Razen routes every task to the best model — Gemini Flash, Claude Sonnet, Claude Haiku — so you get the right brain for the job. The output of a team, in one chat." },
      { property: "og:title", content: "Razen — The AI employee" },
      { property: "og:description", content: "Multi-model AI: Gemini Flash for speed, Claude Sonnet for craft. Researches, writes, plans, builds. One chat." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <ModelStrip />
      <Modes />
      <Demo />
      <Compare />
      <Proof />
      <CTA />
      <Footer />
    </div>
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

      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 md:pt-32 lg:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground shadow-soft md:mx-auto md:flex"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Multi-model routing · Gemini Flash · Claude Sonnet 4.5
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
          ChatGPT picks one model and prays. Razen routes every task to the best brain on Earth —
          Gemini Flash for speed, Claude Sonnet for craft — so you always get the right answer, fast.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Link to="/signup">
            <Button size="lg" className="h-12 rounded-full px-7 text-base font-medium shadow-soft">
              Try Razen free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="h-12 rounded-full border-border/80 bg-card/40 px-7 text-base">
              See pricing
            </Button>
          </Link>
        </motion.div>
        <p className="mt-4 text-center text-xs text-muted-foreground">No credit card · 25 free credits every day</p>
      </div>
    </section>
  );
}

function ModelStrip() {
  const items = [
    { label: "Gemini 2.5 Flash", role: "Live web research", icon: Globe },
    { label: "Claude Sonnet 4.5", role: "Writing & strategy", icon: PenTool },
    { label: "Claude Haiku 4.5", role: "Fast code & plans", icon: Zap },
    { label: "Gemini Flash Lite", role: "Quick lookups", icon: Sparkles },
  ];
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          One chat. Best-in-class models. Auto-routed.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background">
                <it.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-xs text-muted-foreground">{it.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Modes() {
  const items = [
    { icon: Search, title: "Research", body: "Live web search with cited sources. Cross-references, fact-checks, writes a brief — not a hallucination.", badge: "Gemini Flash" },
    { icon: PenTool, title: "Write", body: "Drafts, edits, polishes. Matches your tone. Returns clean copy with a change-log of every cut.", badge: "Claude Sonnet" },
    { icon: ListChecks, title: "Plan", body: "Turns a vague goal into a structured plan with owners, timelines, risks and a definition of done.", badge: "Claude Sonnet" },
    { icon: Code2, title: "Build", body: "Writes runnable code. Reviews architectures. Debugs. Returns artifacts you can ship today.", badge: "Claude Sonnet" },
  ];
  return (
    <section>
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Four specialists. One brain.</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">A team in a tab.</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Switch modes inside the same chat. Razen picks the right model for the job, every time.
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
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Gemini Flash</span>
          </div>
          <div className="space-y-4 p-7 text-sm leading-relaxed">
            <div className="rounded-xl bg-muted px-4 py-3 text-foreground/90">
              Compare the funding history of the top 3 AI agent startups in 2025.
            </div>
            <div className="space-y-2 text-muted-foreground">
              <p>↳ Searching 18 sources… cross-referencing Crunchbase and recent press…</p>
            </div>
            <div className="space-y-3">
              <p className="font-medium text-foreground">Here's what I found:</p>
              <ul className="space-y-2 text-foreground/85">
                <li><span className="font-medium">Cognition AI</span> — $4B valuation, Series C led by Founders Fund <span className="citation-pill">[1]</span></li>
                <li><span className="font-medium">Adept</span> — Acqui-hired by Amazon, ~$350M deal value <span className="citation-pill">[2]</span></li>
                <li><span className="font-medium">Sierra</span> — $4.5B valuation, $175M Series B <span className="citation-pill">[3]</span></li>
              </ul>
              <p className="text-xs text-muted-foreground italic">12 sources cited · 2 credits used</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Compare() {
  const rows = [
    { f: "Multi-model routing", razen: true, chatgpt: false, claude: false },
    { f: "Live web research with citations", razen: true, chatgpt: true, claude: false },
    { f: "Long-term memory across chats", razen: true, chatgpt: true, claude: false },
    { f: "Mode-specific system prompts", razen: true, chatgpt: false, claude: false },
    { f: "Per-task pricing (pay for what you use)", razen: true, chatgpt: false, claude: false },
    { f: "Markdown export of any chat", razen: true, chatgpt: false, claude: false },
    { f: "Free daily credits, no card", razen: true, chatgpt: true, claude: true },
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
  const quotes = [
    { q: "I cancelled three subscriptions the week I started using Razen. It's the only chat I open now.", a: "Maya Chen", r: "Head of Operations" },
    { q: "Research mode alone is worth it. Sources are real, the analysis is sharp, faster than my analyst.", a: "Jules Akerman", r: "Founder, Halcyon" },
    { q: "Plan mode turned a 90-minute kickoff into a 10-minute review. I'm not going back.", a: "Diego Marín", r: "VP Engineering" },
  ];
  return (
    <section className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Operators are switching</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">From bookmarks of tools to one chat.</h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {quotes.map((t) => (
            <figure key={t.a} className="relative rounded-2xl border border-border/70 bg-background/70 p-7 shadow-soft">
              <Quote className="absolute right-5 top-5 h-7 w-7 text-primary/15" />
              <blockquote className="font-display text-xl leading-snug text-foreground/90">
                "{t.q}"
              </blockquote>
              <figcaption className="mt-6 text-sm">
                <div className="font-medium text-foreground">{t.a}</div>
                <div className="text-muted-foreground">{t.r}</div>
              </figcaption>
            </figure>
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
          Hire Razen. 25 free credits every day, forever. Upgrade only when you outgrow them.
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
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Search, PenTool, ListChecks, Code2, Quote } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Razen — Your AI employee" },
      { name: "description", content: "An AI employee that researches, writes, plans, and builds. The output of a team — in one chat. Try free, no card." },
      { property: "og:title", content: "Razen — Your AI employee" },
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
      <Modes />
      <Demo />
      <Proof />
      <CTA />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grain" />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-20 md:pt-32 lg:pt-40 text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground shadow-soft"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Now with web research and document analysis
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto mt-7 max-w-4xl font-display text-[44px] leading-[1.02] tracking-tight md:text-7xl lg:text-[88px]"
        >
          Hire an AI employee.<br />
          <span className="italic text-muted-foreground">Not another chatbot.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl"
        >
          Razen researches the live web, drafts documents, plans projects, and writes code —
          the work of a full team, sitting inside one conversation.
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
        <p className="mt-4 text-xs text-muted-foreground">No credit card · 25 free messages every day</p>
      </div>
    </section>
  );
}

function Modes() {
  const items = [
    { icon: Search, title: "Research mode", body: "Live web search with cited sources. Cross-references, fact-checks, and writes you a brief — not a hallucination." },
    { icon: PenTool, title: "Write mode", body: "Drafts, edits and polishes. Matches your tone. Returns clean copy with a change-log of every cut." },
    { icon: ListChecks, title: "Plan mode", body: "Turns a vague goal into a structured plan with owners, timelines, risks and a definition of done." },
    { icon: Code2, title: "Build mode", body: "Writes runnable code. Reviews architectures. Debugs. Returns artifacts you can ship today." },
  ];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Four specialists. One brain.</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">A team in a tab.</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Switch modes inside the same chat. Razen remembers the context and shifts how it thinks.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="group rounded-2xl border border-border/70 bg-card/70 p-7 shadow-soft transition hover:shadow-card"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
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
              "Conversations saved. Pick up tomorrow.",
            ].map((b) => (
              <li key={b} className="flex items-start gap-3 text-foreground/85">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
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
          <div className="flex items-center gap-2 border-b border-border/60 bg-card/60 px-5 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            </div>
            <span className="ml-3 text-xs text-muted-foreground">razen — research mode</span>
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
              <p className="text-xs text-muted-foreground italic">Full report saved · 12 sources cited</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Proof() {
  const quotes = [
    { q: "I cancelled three subscriptions the week I started using Razen. It's the only chat I open now.", a: "Maya Chen", r: "Head of Operations" },
    { q: "The research mode alone is worth it. Sources are real, the analysis is sharp, and it's faster than my analyst.", a: "Jules Akerman", r: "Founder, Halcyon" },
    { q: "Plan mode turned a 90-minute kickoff into a 10-minute review. I'm not going back.", a: "Diego Marín", r: "VP Engineering" },
  ];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Operators are switching</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">From bookmarks of tools to one chat.</h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {quotes.map((t) => (
            <figure key={t.a} className="relative rounded-2xl border border-border/70 bg-card/60 p-7 shadow-soft">
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
      <div className="mx-auto max-w-4xl px-5 py-28 text-center">
        <h2 className="font-display text-5xl leading-[1.02] md:text-7xl">
          Stop juggling tabs.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-background/70">
          Hire Razen. 25 free messages every day, forever. Upgrade only when you outgrow them.
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
        <div className="flex gap-6">
          <Link to="/features" className="hover:text-foreground">Capabilities</Link>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

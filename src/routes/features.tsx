import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, PenTool, ListChecks, Code2, FileText, Zap, Sparkles, Lock, Brain, ArrowRight } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Capabilities — Razen" },
      { name: "description", content: "Live web research, document analysis, multi-mode reasoning, file uploads, chat history, long-term memory. The work of a team, in one chat." },
      { property: "og:title", content: "Capabilities — Razen" },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <div className="min-h-screen">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute right-[-10rem] top-[-10rem] h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, oklch(0.7 0.18 45 / 0.5), transparent 70%)" }} />
        <div className="relative mx-auto max-w-6xl px-5 py-20 md:py-28">
          <p className="text-sm font-medium text-primary">Capabilities</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.98] md:text-7xl">
            Everything you'd hire<br />a team for.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Eight primitives that compose into anything. Switch modes mid-chat. Razen routes every task to the right brain.
          </p>
        </div>
      </section>

      {/* Featured trio — research / write / plan / build */}
      <Featured />

      {/* Supporting capabilities */}
      <Supporting />

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-foreground text-background">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <Brain className="mx-auto h-9 w-9 text-background/40" />
          <h2 className="mt-5 font-display text-4xl md:text-5xl">See it in your own work.</h2>
          <p className="mx-auto mt-5 max-w-md text-background/70">
            Most operators feel the difference inside the first three messages.
          </p>
          <Link to="/signup" className="mt-8 inline-block">
            <Button size="lg" className="h-12 rounded-full bg-background px-7 text-base text-foreground hover:bg-background/90">
              Start free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

const MODES = [
  {
    icon: Search,
    title: "Research mode",
    body: "Cross-references live web sources and writes a brief — with citations inline. No invented URLs. Flags uncertainty explicitly.",
    sample: "Compare the funding history of the top 3 AI agent startups in 2025.",
  },
  {
    icon: PenTool,
    title: "Write mode",
    body: "Editorial-grade drafting and revision. Matches your tone, returns a change-log of every cut. Pulitzer-trained voice.",
    sample: "Tighten this fundraising email — make it sound less desperate.",
  },
  {
    icon: ListChecks,
    title: "Plan mode",
    body: "Turns ambiguity into structure. Goal, assumptions, owners, timing, risks, definition of done. Pushes back when the goal is fuzzy.",
    sample: "Plan a 6-week launch for a B2B SaaS in EU regulated markets.",
  },
  {
    icon: Code2,
    title: "Build mode",
    body: "Production code, not pseudo-snippets. Reviews architectures. Suggests tests. Returns artifacts you can ship today.",
    sample: "Add Stripe webhook signature verification to my Next.js route.",
  },
];

function Featured() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="text-sm font-medium text-primary">Four modes</p>
        <h2 className="mt-2 font-display text-3xl md:text-4xl">A specialist for every task.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {MODES.map((m, i) => (
            <motion.div
              key={m.title}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-8 shadow-soft transition hover:shadow-card"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-foreground text-background">
                <m.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-6 font-display text-2xl">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              <div className="mt-6 rounded-xl border border-border/60 bg-background/60 px-4 py-3">
                <p className="font-mono text-xs text-muted-foreground">prompt</p>
                <p className="mt-1 text-sm text-foreground/85">"{m.sample}"</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SUPPORTING = [
  { icon: FileText, title: "Document analysis", body: "Drop in PDFs, screenshots, contracts. Razen extracts, summarises, and answers." },
  { icon: Sparkles, title: "Long-term memory", body: "Remembers your role, projects, preferences. Personalises every reply on Pro and Elite." },
  { icon: Zap, title: "Streaming responses", body: "Token-by-token output. See the thinking unfold instead of waiting for a wall of text." },
  { icon: Lock, title: "Private by default", body: "Row-level isolation. Your conversations are yours. Encrypted at rest." },
];

function Supporting() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="text-sm font-medium text-primary">Plus</p>
        <h2 className="mt-2 font-display text-3xl md:text-4xl">The infrastructure to make it usable.</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORTING.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-soft transition hover:shadow-card">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

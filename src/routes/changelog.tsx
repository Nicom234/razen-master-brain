import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/changelog")({
  head: () => ({ meta: [{ title: "Changelog — Razen" }, { name: "description", content: "What's new in Razen." }] }),
  component: Changelog,
});

const ENTRIES = [
  { date: "2026-04", title: "Command palette + dashboard", body: "⌘K opens anywhere. New /app dashboard, /usage analytics, /history with pinning, sharing and search." },
  { date: "2026-04", title: "Multi-model routing", body: "Razen now routes Research → Gemini Flash, Write/Plan/Build → Claude Sonnet 4.5 (Elite) or Haiku 4.5 (Pro). The right brain for the job." },
  { date: "2026-04", title: "Long-term memory", body: "Pro and Elite users get a memory store. Razen learns your role, projects, and voice — and uses it every reply." },
  { date: "2026-04", title: "Variable credit cost", body: "Light tasks cost 1–3 credits. Heavy plans and code generations cost more. You see the price before you send." },
];

function Changelog() {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Changelog</p>
        <h1 className="mt-3 font-display text-5xl md:text-6xl">What's new.</h1>
        <p className="mt-3 text-muted-foreground">A running log of every meaningful improvement.</p>
        <div className="mt-12 space-y-10">
          {ENTRIES.map((e, i) => (
            <article key={i} className="border-l-2 border-border pl-6">
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{e.date}</p>
              <h2 className="mt-2 font-display text-2xl">{e.title}</h2>
              <p className="mt-2 text-muted-foreground">{e.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

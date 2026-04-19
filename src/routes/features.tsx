import { createFileRoute } from "@tanstack/react-router";
import { Search, PenTool, ListChecks, Code2, FileText, Zap, Sparkles, Lock } from "lucide-react";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Capabilities — Razen" },
      { name: "description", content: "Live web research, document analysis, multi-mode reasoning, file uploads, chat history. Everything you'd hire a team for." },
      { property: "og:title", content: "Capabilities — Razen" },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  const features = [
    { icon: Search, title: "Live web research", body: "Real-time search with grounded citations. No invented URLs, no stale training data." },
    { icon: FileText, title: "Document analysis", body: "Upload PDFs, images, contracts, screenshots. Razen reads, extracts, summarises." },
    { icon: PenTool, title: "Editorial-grade writing", body: "Match any tone. Draft, edit, polish. Returns a change-log of every cut." },
    { icon: ListChecks, title: "Structured planning", body: "Turn ambiguity into goals, owners, timelines, risks and definition-of-done." },
    { icon: Code2, title: "Production code", body: "Writes runnable code. Reviews architectures. Returns artifacts you can ship." },
    { icon: Sparkles, title: "Conversation memory", body: "Threads are saved. Pick up where you left off. Search past chats instantly." },
    { icon: Zap, title: "Streaming responses", body: "Token-by-token output. See the thinking unfold. No waiting for a single block." },
    { icon: Lock, title: "Private by default", body: "Row-level isolation. Your conversations are yours. Encrypted at rest." },
  ];
  return (
    <div className="min-h-screen">
      <Nav />
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="text-sm font-medium text-primary">Capabilities</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl md:text-7xl">Everything you'd hire a team for.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">Eight primitives that compose into anything.</p>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-soft transition hover:shadow-card">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

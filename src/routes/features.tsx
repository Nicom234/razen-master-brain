import { createFileRoute } from "@tanstack/react-router";
import { Brain, Code2, Globe, Layers, Lock, Zap } from "lucide-react";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Razen AI" },
      { name: "description", content: "Web research, code execution, long-horizon reasoning, agent tools — all in one unified brain." },
      { property: "og:title", content: "Features — Razen AI" },
      { property: "og:description", content: "One brain. All capabilities." },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  const features = [
    { icon: Globe, title: "Web Research", body: "Fresh search, full-page reads, source citations. Not a static training set — the real internet, right now." },
    { icon: Code2, title: "Code Execution", body: "Sandboxed runtime executes generated code. Iterates on errors. Returns the artifact." },
    { icon: Brain, title: "Long-Horizon Reasoning", body: "Plans across hundreds of steps. Maintains state across the whole task. Self-corrects mid-flight." },
    { icon: Layers, title: "Unified Agent", body: "No tool picker. No mode switching. The brain decides which capability to invoke." },
    { icon: Zap, title: "Streaming Responses", body: "Token-by-token output. See thoughts as they form. No spinner, no waiting." },
    { icon: Lock, title: "Secure by Default", body: "Row-level isolation, encrypted at rest, BYOK supported. Your data stays yours." },
  ];
  return (
    <div className="min-h-screen">
      <Nav />
      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="font-mono text-xs text-primary">// features.md</p>
        <h1 className="mt-2 font-display text-5xl md:text-7xl">capabilities.</h1>
        <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground">Six primitives that compose into anything.</p>
        <div className="mt-12 grid gap-px overflow-hidden rounded border border-border/60 bg-border/40 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="bg-background p-6 transition hover:bg-card">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-mono text-sm font-medium">{f.title}</h3>
              <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

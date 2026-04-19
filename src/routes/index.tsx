import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Code2, Globe, Zap, Check, Minus } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Razen AI — The Master Brain" },
      { name: "description", content: "One unified AI agent. Research, build, reason. Positioned against Manus and Genspark — built for operators." },
      { property: "og:title", content: "Razen AI — The Master Brain" },
      { property: "og:description", content: "One unified AI agent. Research, build, reason." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <Comparison />
      <Features />
      <CTA />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute inset-0 scanlines" />
      <div className="absolute left-1/2 top-1/3 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-32">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="font-mono text-xs text-primary">
          [BOOT_OK] · razen.ai/v1 · master_brain online
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mt-6 font-display text-5xl leading-[0.95] tracking-tight md:text-7xl lg:text-8xl">
          The Master Brain<span className="text-primary">.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} className="mt-6 max-w-xl font-mono text-sm leading-relaxed text-muted-foreground md:text-base">
          One unified agent. Not a marketplace of half-baked tools.
          Razen researches the live web, executes real actions, and reasons across long horizons —
          all from a single terminal.<span className="terminal-cursor" />
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }} className="mt-10 flex flex-wrap items-center gap-3">
          <Link to="/signup"><Button size="lg" className="h-12 px-6 font-mono pulse-glow">$ start_session<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          <Link to="/features"><Button size="lg" variant="ghost" className="h-12 px-6 font-mono">read_docs →</Button></Link>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-16 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded border border-border/60 bg-border/40 font-mono text-xs">
          {[
            ["latency", "<400ms"],
            ["context", "200k tok"],
            ["uptime", "99.97%"],
          ].map(([k, v]) => (
            <div key={k} className="bg-background p-4">
              <div className="text-muted-foreground">{k}</div>
              <div className="mt-1 text-primary">{v}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    ["Single unified agent", true, false, false],
    ["Live web research", true, true, true],
    ["Real code execution", true, true, false],
    ["Long-horizon reasoning", true, false, false],
    ["No tool-picker friction", true, false, false],
    ["Bring-your-own model keys", true, false, false],
  ];
  return (
    <section className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p className="font-mono text-xs text-primary">// comparison.tsv</p>
        <h2 className="mt-2 font-display text-4xl md:text-5xl">vs the rest.</h2>
        <div className="mt-10 overflow-x-auto rounded terminal-border">
          <table className="w-full font-mono text-sm">
            <thead className="border-b border-border/60 bg-background/50">
              <tr>
                <th className="px-4 py-3 text-left text-muted-foreground">capability</th>
                <th className="px-4 py-3 text-primary">razen</th>
                <th className="px-4 py-3 text-muted-foreground">manus</th>
                <th className="px-4 py-3 text-muted-foreground">genspark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, r, m, g]) => (
                <tr key={label as string} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3 text-foreground">{label}</td>
                  <td className="px-4 py-3 text-center">{r ? <Check className="mx-auto h-4 w-4 text-primary" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground" />}</td>
                  <td className="px-4 py-3 text-center">{m ? <Check className="mx-auto h-4 w-4 text-muted-foreground" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground" />}</td>
                  <td className="px-4 py-3 text-center">{g ? <Check className="mx-auto h-4 w-4 text-muted-foreground" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: Brain, title: "Long-horizon reasoning", body: "Plans across hundreds of steps. Maintains state. Recovers from failure." },
    { icon: Globe, title: "Live web research", body: "Fresh data, cited sources, no hallucinated URLs. Real browsing primitives." },
    { icon: Code2, title: "Real code execution", body: "Sandboxed runtime. Writes, runs, debugs. Returns artifacts you can use." },
    { icon: Zap, title: "Single agent, no friction", body: "No mode switching. No tool picker. One brain, all jobs." },
  ];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p className="font-mono text-xs text-primary">// capabilities.json</p>
        <h2 className="mt-2 font-display text-4xl md:text-5xl">what it does.</h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded border border-border/60 bg-border/40 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.title} className="group bg-background p-6 transition hover:bg-card">
              <it.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-mono text-sm font-medium">{it.title}</h3>
              <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="border-t border-border/60 scanlines">
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h2 className="font-display text-5xl md:text-6xl">stop assembling tools.</h2>
        <p className="mt-4 font-mono text-sm text-muted-foreground">Boot the brain. Get to work.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/signup"><Button size="lg" className="h-12 px-6 font-mono pulse-glow">$ get_access<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          <Link to="/pricing"><Button size="lg" variant="ghost" className="h-12 px-6 font-mono">see_pricing</Button></Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 font-mono text-xs text-muted-foreground md:flex-row">
        <p>© razen.ai · master_brain v1</p>
        <p>built in london · ship on /dev/main</p>
      </div>
    </footer>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/shortcuts")({
  head: () => ({ meta: [{ title: "Shortcuts — Razen" }] }),
  component: () => {
    const SHORTCUTS = [
      { keys: ["⌘", "K"], action: "Open command palette" },
      { keys: ["⌘", "↵"], action: "Send message" },
      { keys: ["⌘", "N"], action: "New chat" },
      { keys: ["⌘", "E"], action: "Export chat as Markdown" },
      { keys: ["1–4"], action: "Switch mode (Research / Write / Plan / Build)" },
      { keys: ["esc"], action: "Close any modal" },
    ];
    return (
      <div className="min-h-screen">
        <Nav />
        <div className="mx-auto max-w-2xl px-5 py-16">
          <h1 className="font-display text-5xl">Shortcuts.</h1>
          <p className="mt-3 text-muted-foreground">Razen rewards keyboard fluency.</p>
          <ul className="mt-10 divide-y divide-border/50">
            {SHORTCUTS.map((s) => (
              <li key={s.action} className="flex items-center justify-between py-4">
                <span>{s.action}</span>
                <span className="flex gap-1">{s.keys.map((k) => <kbd key={k} className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">{k}</kbd>)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
});

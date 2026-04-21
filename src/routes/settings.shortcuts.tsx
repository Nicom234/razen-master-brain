import { createFileRoute } from "@tanstack/react-router";
import { Card } from "./settings.index";

export const Route = createFileRoute("/settings/shortcuts")({
  component: ShortcutsPage,
});

const SHORTCUTS = [
  { keys: ["⌘", "K"], action: "Open command palette" },
  { keys: ["⌘", "/"], action: "Toggle web search" },
  { keys: ["⌘", "↵"], action: "Send message" },
  { keys: ["⌘", "N"], action: "New chat" },
  { keys: ["⌘", "B"], action: "Toggle sidebar" },
  { keys: ["⌘", "E"], action: "Export chat as Markdown" },
  { keys: ["⌘", "S"], action: "Share read-only link" },
  { keys: ["1"], action: "Switch to Research" },
  { keys: ["2"], action: "Switch to Write" },
  { keys: ["3"], action: "Switch to Plan" },
  { keys: ["4"], action: "Switch to Build" },
  { keys: ["esc"], action: "Close any modal" },
];

function ShortcutsPage() {
  return (
    <div className="space-y-8">
      <Card title="Keyboard shortcuts" description="Razen is built keyboard-first. These work anywhere.">
        <ul className="divide-y divide-border/50">
          {SHORTCUTS.map((s) => (
            <li key={s.action} className="flex items-center justify-between py-3 text-sm">
              <span>{s.action}</span>
              <span className="flex gap-1">{s.keys.map((k) => (
                <kbd key={k} className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">{k}</kbd>
              ))}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

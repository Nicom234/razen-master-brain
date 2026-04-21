import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, MessageSquare, Settings, BarChart3, Keyboard, Sparkles, Brain, FileText, LogOut, Plus, Sun, Moon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

type Action = { id: string; label: string; hint?: string; icon: typeof Search; run: () => void; group: string };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const { signOut } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const actions: Action[] = [
    { id: "new", label: "New chat", icon: Plus, group: "Actions", run: () => nav({ to: "/app" }) },
    { id: "app", label: "Open Razen", icon: MessageSquare, group: "Navigate", run: () => nav({ to: "/app" }) },
    { id: "history", label: "Chat history", icon: FileText, group: "Navigate", run: () => nav({ to: "/history" }) },
    { id: "usage", label: "Usage analytics", icon: BarChart3, group: "Navigate", run: () => nav({ to: "/usage" }) },
    { id: "memory", label: "Memory", icon: Brain, group: "Navigate", run: () => nav({ to: "/settings/memory" }) },
    { id: "settings", label: "Settings", icon: Settings, group: "Navigate", run: () => nav({ to: "/settings" }) },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, group: "Navigate", run: () => nav({ to: "/shortcuts" }) },
    { id: "pricing", label: "Pricing", icon: Sparkles, group: "Navigate", run: () => nav({ to: "/pricing" }) },
    { id: "light", label: "Switch to light theme", icon: Sun, group: "Theme", run: () => setTheme("light") },
    { id: "dark", label: "Switch to dark theme", icon: Moon, group: "Theme", run: () => setTheme("dark") },
    { id: "system", label: "Use system theme", icon: Sun, group: "Theme", run: () => setTheme("system") },
    { id: "signout", label: "Sign out", icon: LogOut, group: "Account", run: () => signOut() },
  ];

  const filtered = actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
  const groups = filtered.reduce<Record<string, Action[]>>((acc, a) => { (acc[a.group] ||= []).push(a); return acc; }, {});

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {Object.keys(groups).length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-2">
              <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group}</p>
              {items.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { a.run(); setOpen(false); setQ(""); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <a.icon className="h-4 w-4 text-muted-foreground" />
                  {a.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <kbd className="rounded border border-border/70 bg-muted px-1 font-mono">↵</kbd> to run · <kbd className="rounded border border-border/70 bg-muted px-1 font-mono">⌘K</kbd> to toggle
        </div>
      </div>
    </div>
  );
}

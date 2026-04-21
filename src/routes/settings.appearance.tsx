import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Card } from "./settings.index";

export const Route = createFileRoute("/settings/appearance")({
  component: AppearancePage,
});

function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const opts = [
    { id: "light" as const, label: "Light", icon: Sun, desc: "Warm cream editorial" },
    { id: "dark" as const, label: "Dark", icon: Moon, desc: "Low-light focus mode" },
    { id: "system" as const, label: "System", icon: Monitor, desc: "Match your OS" },
  ];
  return (
    <div className="space-y-8">
      <Card title="Theme" description="Razen looks great in either. Pick your default.">
        <div className="grid gap-3 sm:grid-cols-3">
          {opts.map((o) => {
            const active = theme === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setTheme(o.id)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${active ? "border-foreground bg-accent" : "border-border/60 hover:border-foreground/40"}`}
              >
                <o.icon className="h-5 w-5" />
                <div>
                  <p className="font-medium">{o.label}</p>
                  <p className="text-xs text-muted-foreground">{o.desc}</p>
                </div>
                {active && <span className="text-[10px] font-medium uppercase tracking-wider text-primary">Active</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Density" description="Coming soon — compact and comfortable layouts.">
        <p className="text-sm text-muted-foreground">We're shipping density controls in a future release.</p>
      </Card>
    </div>
  );
}

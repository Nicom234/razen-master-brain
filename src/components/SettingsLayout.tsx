import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeft, User, CreditCard, Palette, Brain, Shield, Bell, Keyboard } from "lucide-react";

type Tab = { to: "/settings" | "/settings/billing" | "/settings/appearance" | "/settings/memory" | "/settings/notifications" | "/settings/shortcuts" | "/settings/danger"; label: string; icon: typeof User; exact?: boolean };
const TABS: Tab[] = [
  { to: "/settings", label: "Account", icon: User, exact: true },
  { to: "/settings/billing", label: "Billing", icon: CreditCard },
  { to: "/settings/appearance", label: "Appearance", icon: Palette },
  { to: "/settings/memory", label: "Memory", icon: Brain },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/shortcuts", label: "Shortcuts", icon: Keyboard },
  { to: "/settings/danger", label: "Danger zone", icon: Shield },
];

export function SettingsLayout() {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5">
          <Link to="/app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Razen
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <h1 className="font-display text-4xl md:text-5xl">Settings</h1>
        <p className="mt-2 text-muted-foreground">Tune Razen to fit how you work.</p>

        <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
          <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {TABS.map((t) => {
              const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

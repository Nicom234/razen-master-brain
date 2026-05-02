import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X, Crown, ArrowRight, Lock, Zap, Brain, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

type Tier = "free" | "pro" | "elite";

const DISMISS_KEY = "razen.upgrade.banner.dismissed";

interface UpgradeBannerProps {
  tier: Tier;
  credits: number | null;
  monthlyGrant: number;
}

// Persistent, intelligently-triggered upgrade banner.
// Shown at the top of the app for free users — context shifts based on credit state.
// Dismissible per-session; reappears on hard refresh or when credits run low.
export function UpgradeBanner({ tier, credits, monthlyGrant }: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  // Always show again if credits dropped to 0 — the upgrade moment.
  useEffect(() => {
    if (credits !== null && credits <= 2 && dismissed) {
      setDismissed(false);
    }
  }, [credits, dismissed]);

  if (tier !== "free" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const lowCredits = credits !== null && credits <= 5;
  const outOfCredits = credits !== null && credits <= 0;

  if (outOfCredits) {
    return (
      <div className="relative border-b border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 px-4 py-2.5">
        <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
          <Zap className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 truncate">
            <span className="font-semibold">You're out of credits.</span>{" "}
            <span className="text-muted-foreground">Pro gives you 10× more, Elite gives you the highest ceiling.</span>
          </p>
          <Link to="/pricing">
            <Button size="sm" className="h-8 gap-1.5">
              <Crown className="h-3.5 w-3.5" />Upgrade now
            </Button>
          </Link>
          <button onClick={dismiss} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-background">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (lowCredits) {
    return (
      <div className="relative border-b border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-2.5">
        <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 truncate">
            <span className="font-semibold">{credits} credits left.</span>{" "}
            <span className="text-muted-foreground">Pro starts at $20 — 10× more credits, memory, and the full Build studio.</span>
          </p>
          <Link to="/pricing">
            <Button size="sm" variant="default" className="h-8 gap-1.5">
              See Pro <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button onClick={dismiss} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-background">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Default state — gentle upgrade nudge for new free users.
  void monthlyGrant;
  return (
    <div className="relative border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent px-4 py-2">
      <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
        <Crown className="h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 truncate text-muted-foreground">
          You're on <span className="font-medium text-foreground">Free</span>. Pro unlocks deeper research, the Build studio, memory, and 10× credits.
        </p>
        <Link to="/pricing">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2.5 text-xs hover:bg-primary/10 hover:text-primary">
            See plans <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
        <button onClick={dismiss} className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-background">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Out-of-credits modal — a hard stop with an upgrade CTA when free users hit 0.
// ─────────────────────────────────────────────────────────────────────────────
interface OutOfCreditsModalProps {
  open: boolean;
  onClose: () => void;
}

export function OutOfCreditsModal({ open, onClose }: OutOfCreditsModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
        <div className="p-7 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-orange-500 text-primary-foreground">
            <Zap className="h-6 w-6" />
          </div>
          <h3 className="mt-5 font-display text-2xl">You hit the free ceiling.</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            That's a sign you're getting real value. Pro gives you <strong>10× more credits</strong>,
            memory across every chat, and the full Build studio. Cancel any time.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Link to="/pricing" className="block">
              <Button className="h-11 w-full gap-2">
                <Crown className="h-4 w-4" />Upgrade to Pro
              </Button>
            </Link>
            <Link to="/pricing" className="block">
              <Button variant="outline" className="h-11 w-full gap-2">
                <Sparkles className="h-4 w-4" />See Elite
              </Button>
            </Link>
          </div>

          <div className="mt-6 grid gap-2.5 text-left">
            {[
              { i: Brain, t: "10× more credits", d: "Pro gives you a generous monthly pool — never run out mid-task." },
              { i: Rocket, t: "Build Studio + Memory", d: "Live preview, file tree, ZIP export. And memory across every chat." },
              { i: Crown, t: "Frontier reasoning (Elite)", d: "Deeper research, longer context, the highest ceiling." },
            ].map((b) => (
              <div key={b.t} className="flex items-start gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <b.i className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-xs font-semibold">{b.t}</div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{b.d}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[11px] text-muted-foreground">
            Free credits refill on schedule. Or upgrade for unlimited capacity.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Locked feature banner — inline, contextual lock with an upgrade CTA.
// Use inside workspaces when a feature is gated by tier (e.g. depth >= 4).
// ─────────────────────────────────────────────────────────────────────────────
interface LockedFeatureProps {
  required: "pro" | "elite";
  feature: string;
  description: string;
  compact?: boolean;
}

export function LockedFeature({ required, feature, description, compact }: LockedFeatureProps) {
  const Icon = required === "elite" ? Crown : Sparkles;
  if (compact) {
    return (
      <Link
        to="/pricing"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 transition hover:border-amber-500 hover:bg-amber-500/20"
      >
        <Lock className="h-2.5 w-2.5" />
        {required === "elite" ? "Elite" : "Pro"} · {feature}
      </Link>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {feature} <span className="font-normal text-amber-700 dark:text-amber-400">— {required === "elite" ? "Elite" : "Pro"} feature</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Link to="/pricing">
          <Button size="sm" className="h-8 gap-1.5 bg-gradient-to-br from-amber-500 to-orange-500 text-white hover:opacity-90">
            <Crown className="h-3.5 w-3.5" />Unlock
          </Button>
        </Link>
      </div>
    </div>
  );
}

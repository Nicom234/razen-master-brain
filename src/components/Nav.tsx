import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Nav() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background font-display text-sm leading-none">R</div>
          <span className="font-display text-xl">Razen</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <Link to="/features" className="rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground" activeProps={{ className: "rounded-md px-3 py-1.5 text-foreground" }}>Capabilities</Link>
          <Link to="/pricing" className="rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground" activeProps={{ className: "rounded-md px-3 py-1.5 text-foreground" }}>Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/app"><Button size="sm" className="h-9">Open Razen</Button></Link>
              <Button size="sm" variant="ghost" className="h-9" onClick={signOut}>Sign out</Button>
            </>
          ) : (
            <>
              <Link to="/login" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Sign in</Link>
              <Link to="/signup"><Button size="sm" className="h-9">Get started</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

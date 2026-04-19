import { Link } from "@tanstack/react-router";
import { Terminal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Nav() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
          <Terminal className="h-4 w-4 text-primary" />
          <span>razen<span className="text-primary">/</span>ai</span>
        </Link>
        <nav className="flex items-center gap-1 text-xs">
          <Link to="/features" className="px-3 py-1.5 text-muted-foreground hover:text-foreground transition" activeProps={{ className: "px-3 py-1.5 text-foreground" }}>features</Link>
          <Link to="/pricing" className="px-3 py-1.5 text-muted-foreground hover:text-foreground transition" activeProps={{ className: "px-3 py-1.5 text-foreground" }}>pricing</Link>
          {user ? (
            <>
              <Link to="/app"><Button size="sm" variant="default" className="ml-2 h-8">open_app</Button></Link>
              <Button size="sm" variant="ghost" className="h-8" onClick={signOut}>logout</Button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 py-1.5 text-muted-foreground hover:text-foreground transition">login</Link>
              <Link to="/signup"><Button size="sm" className="ml-2 h-8">get_access</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

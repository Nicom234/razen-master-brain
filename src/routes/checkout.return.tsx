import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Welcome to Razen" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ session_id: typeof s.session_id === "string" ? s.session_id : undefined }),
  component: ReturnPage,
});

function ReturnPage() {
  const { session_id } = Route.useSearch();
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
        <h1 className="mt-6 font-display text-4xl">You're in.</h1>
        <p className="mt-3 text-muted-foreground">
          Your subscription is active. Credits are landing in your account now.
        </p>
        <Link to="/app" search={{ upgraded: "1" } as never}>
          <Button className="mt-8 h-11 px-7">Open Razen</Button>
        </Link>
        {session_id && <p className="mt-6 text-xs text-muted-foreground">ref: {session_id.slice(-12)}</p>}
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Razen" }, { name: "description", content: "Sign in to Razen." }] }),
  component: Login,
});

function Login() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav({ to: "/app" }); }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    nav({ to: "/app" });
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/app` });
    if (r.error) { toast.error(r.error.message); return; }
    if (r.redirected) return;
    nav({ to: "/app" });
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto flex max-w-md flex-col px-5 py-16">
        <h1 className="font-display text-5xl">Welcome back.</h1>
        <p className="mt-3 text-muted-foreground">Sign in to continue.</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-7 shadow-soft">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary underline-offset-4 hover:underline">Forgot?</Link>
            </div>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="h-11 w-full">{loading ? "Signing in…" : "Sign in"}</Button>
          <div className="relative py-1 text-center"><span className="text-xs text-muted-foreground">or</span></div>
          <Button type="button" variant="outline" onClick={google} className="h-11 w-full">Continue with Google</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Razen? <Link to="/signup" className="text-primary underline underline-offset-4">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

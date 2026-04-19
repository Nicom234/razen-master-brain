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

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Get started — Razen" }, { name: "description", content: "Create your Razen account. 25 free messages every day." }] }),
  component: Signup,
});

function Signup() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { if (user) nav({ to: "/app" }); }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Check your email to confirm your account.");
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
        <h1 className="font-display text-5xl">Hire Razen.</h1>
        <p className="mt-3 text-muted-foreground">25 free messages, every day. No card.</p>

        {sent ? (
          <div className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-7 shadow-soft">
            <h2 className="font-display text-2xl">Check your inbox.</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
              Click it to activate your account.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">Didn't get it? Check spam, or wait 60s and try again.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-7 shadow-soft">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password <span className="text-xs text-muted-foreground">(min 8 chars)</span></Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full">{loading ? "Creating account…" : "Create account"}</Button>
            <div className="relative py-1 text-center"><span className="text-xs text-muted-foreground">or</span></div>
            <Button type="button" variant="outline" onClick={google} className="h-11 w-full">Continue with Google</Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary underline underline-offset-4">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

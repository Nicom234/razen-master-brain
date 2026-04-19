import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Razen AI" }, { name: "description", content: "Create your Master Brain account." }] }),
  component: Signup,
});

function Signup() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    toast.success("Check your email to verify your account.");
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <p className="font-mono text-xs text-primary">// auth/signup</p>
        <h1 className="mt-2 font-display text-5xl">create_account.</h1>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded p-6 terminal-border">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs">email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="font-mono text-xs">password (min 8)</Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
          </div>
          <Button type="submit" disabled={loading} className="w-full font-mono">{loading ? "creating…" : "$ signup"}</Button>
          <div className="relative py-2 text-center"><span className="font-mono text-[10px] text-muted-foreground">— or —</span></div>
          <Button type="button" variant="outline" onClick={google} className="w-full font-mono">continue_with_google</Button>
        </form>
        <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
          have an account? <Link to="/login" className="text-primary underline underline-offset-4">login →</Link>
        </p>
      </div>
    </div>
  );
}

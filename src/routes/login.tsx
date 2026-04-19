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
  head: () => ({ meta: [{ title: "Login — Razen AI" }, { name: "description", content: "Access the Master Brain." }] }),
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
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) { toast.error(result.error.message); return; }
    if (result.redirected) return;
    nav({ to: "/app" });
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <p className="font-mono text-xs text-primary">// auth/login</p>
        <h1 className="mt-2 font-display text-5xl">login.</h1>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded p-6 terminal-border">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs">email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="password" className="font-mono text-xs">password</Label>
              <Link to="/forgot-password" className="font-mono text-xs text-primary underline-offset-4 hover:underline">forgot?</Link>
            </div>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
          </div>
          <Button type="submit" disabled={loading} className="w-full font-mono">{loading ? "auth…" : "$ login"}</Button>
          <div className="relative py-2 text-center"><span className="font-mono text-[10px] text-muted-foreground">— or —</span></div>
          <Button type="button" variant="outline" onClick={google} className="w-full font-mono">continue_with_google</Button>
        </form>
        <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
          no account? <Link to="/signup" className="text-primary underline underline-offset-4">signup →</Link>
        </p>
      </div>
    </div>
  );
}

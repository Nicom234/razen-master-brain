import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — Razen AI" }] }),
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase puts type=recovery in the URL hash on the magic link
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
    } else {
      // Also detect existing recovery session
      supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated.");
    nav({ to: "/app" });
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="font-mono text-xs text-primary">// auth/reset</p>
        <h1 className="mt-2 font-display text-5xl">new_password.</h1>
        {!ready ? (
          <p className="mt-8 rounded p-6 font-mono text-sm text-muted-foreground terminal-border">
            invalid or expired link. request a new reset email.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded p-6 terminal-border">
            <div className="space-y-2">
              <Label htmlFor="password" className="font-mono text-xs">new password (min 8)</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
            </div>
            <Button type="submit" disabled={loading} className="w-full font-mono">{loading ? "saving…" : "$ update_password"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}

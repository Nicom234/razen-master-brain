import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Razen AI" }] }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="font-mono text-xs text-primary">// auth/recover</p>
        <h1 className="mt-2 font-display text-5xl">recover.</h1>
        {sent ? (
          <p className="mt-8 rounded p-6 font-mono text-sm terminal-border">
            → check {email}. follow the link to set a new password.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded p-6 terminal-border">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-mono text-xs">email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" />
            </div>
            <Button type="submit" disabled={loading} className="w-full font-mono">{loading ? "sending…" : "$ send_reset_link"}</Button>
          </form>
        )}
        <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
          <Link to="/login" className="text-primary underline underline-offset-4">← back_to_login</Link>
        </p>
      </div>
    </div>
  );
}

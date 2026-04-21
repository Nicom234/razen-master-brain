import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/settings/")({
  component: AccountSettings,
});

function AccountSettings() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name,email").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setName(data?.display_name ?? ""); setEmail(data?.email ?? user.email ?? ""); });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile updated.");
  };

  if (!user) return null;
  return (
    <div className="space-y-8">
      <Card title="Profile" description="How you appear inside Razen.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
          <Field label="Email"><Input value={email} disabled /></Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </Card>

      <Card title="Account" description="Sign-in details and identifiers.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs">{user.id}</dd></div>
          <div><dt className="text-muted-foreground">Created</dt><dd>{new Date(user.created_at).toLocaleDateString()}</dd></div>
        </dl>
      </Card>
    </div>
  );
}

export function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-6 shadow-soft">
      <h2 className="font-display text-xl">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, Field } from "./settings.index";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tier, setTier] = useState<"free" | "pro" | "elite">("free");
  const [briefing, setBriefing] = useState(false);
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.tier) setTier(data.tier as "free" | "pro" | "elite"); });
    supabase.from("user_settings").select("daily_briefing,briefing_topic").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) { setBriefing(data.daily_briefing); setTopic(data.briefing_topic ?? ""); } });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, daily_briefing: briefing, briefing_topic: topic || null });
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Saved.");
  };

  if (!user) return null;
  const locked = tier === "free";

  return (
    <div className="space-y-8">
      <Card title="Daily briefing" description="Razen prepares a 60-second summary of what matters to you each morning, ready in your chat.">
        {locked ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 p-6 text-sm text-muted-foreground">
            Daily briefings are part of Pro and Elite. <a href="/pricing" className="text-primary underline">Upgrade</a> to enable.
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={briefing} onChange={(e) => setBriefing(e.target.checked)} className="h-4 w-4 rounded border-border" />
              <span className="text-sm">Generate a fresh briefing each weekday morning</span>
            </label>
            <Field label="Briefing topic" hint="What should Razen focus on? (e.g. 'AI startup news, fintech, top tech hires')">
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What matters to you" />
            </Field>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save preferences"}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Email notifications" description="We keep these to a minimum — you only hear from us about your account.">
        <p className="text-sm text-muted-foreground">No marketing email. We send transactional updates only (security, billing, plan changes).</p>
      </Card>
    </div>
  );
}

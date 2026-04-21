import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "./settings.index";

export const Route = createFileRoute("/settings/danger")({
  component: DangerPage,
});

function DangerPage() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [working, setWorking] = useState(false);

  const wipeChats = async () => {
    if (!user) return;
    if (!confirm("Delete ALL of your chats? This cannot be undone.")) return;
    setWorking(true);
    await supabase.from("messages").delete().eq("user_id", user.id);
    await supabase.from("conversations").delete().eq("user_id", user.id);
    setWorking(false);
    toast.success("All chats deleted.");
  };

  const wipeMemory = async () => {
    if (!user) return;
    if (!confirm("Forget everything Razen knows about you?")) return;
    setWorking(true);
    await supabase.from("memories").delete().eq("user_id", user.id);
    setWorking(false);
    toast.success("Memory cleared.");
  };

  const exportEverything = async () => {
    if (!user) return;
    setWorking(true);
    const [convs, msgs, mems, profile] = await Promise.all([
      supabase.from("conversations").select("*").eq("user_id", user.id),
      supabase.from("messages").select("*").eq("user_id", user.id),
      supabase.from("memories").select("*").eq("user_id", user.id),
      supabase.from("profiles").select("*").eq("user_id", user.id),
    ]);
    const blob = new Blob([JSON.stringify({ profile: profile.data, conversations: convs.data, messages: msgs.data, memories: mems.data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `razen-export-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    setWorking(false);
  };

  const signOutEverywhere = async () => {
    await supabase.auth.signOut({ scope: "global" });
    await signOut();
    nav({ to: "/" });
  };

  return (
    <div className="space-y-6">
      <Card title="Export your data" description="Download a JSON archive of everything Razen has stored for you.">
        <Button onClick={exportEverything} disabled={working} variant="outline">Download my data</Button>
      </Card>

      <Card title="Sign out everywhere" description="Invalidate all sessions across devices.">
        <Button onClick={signOutEverywhere} disabled={working} variant="outline">Sign out of all devices</Button>
      </Card>

      <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <h2 className="font-display text-xl text-destructive">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">Permanent actions. We can't recover this for you.</p>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background p-4">
            <div><p className="font-medium">Delete all chats</p><p className="text-xs text-muted-foreground">Removes every conversation and message.</p></div>
            <Button variant="destructive" onClick={wipeChats} disabled={working}>Delete chats</Button>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background p-4">
            <div><p className="font-medium">Wipe memory</p><p className="text-xs text-muted-foreground">Razen forgets everything it has learned about you.</p></div>
            <Button variant="destructive" onClick={wipeMemory} disabled={working}>Wipe memory</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

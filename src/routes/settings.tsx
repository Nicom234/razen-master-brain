import { createFileRoute, redirect } from "@tanstack/react-router";
import { SettingsLayout } from "@/components/SettingsLayout";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Razen" }, { name: "description", content: "Manage your Razen account, billing, appearance, memory, and more." }] }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      // Light client guard; full guard happens in component via useAuth.
    }
  },
  component: SettingsLayout,
});

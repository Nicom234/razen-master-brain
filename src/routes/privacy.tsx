import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — Razen" }, { name: "description", content: "How Razen handles your data." }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-screen">
      <Nav />
      <article className="mx-auto max-w-3xl px-5 py-16 md:py-24 prose-chat">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Last updated April 2026</p>
        <h1 className="mt-3 font-display text-5xl">Privacy.</h1>
        <p>We collect only what's needed to run Razen: your email, your chats, and your saved memories. Nothing is sold. Nothing is shared with third-party advertisers.</p>
        <h2>What we store</h2>
        <ul>
          <li>Your email and display name (for sign-in).</li>
          <li>Your chats and uploaded files (so you can come back to them).</li>
          <li>Memories you save (so Razen can personalise replies).</li>
          <li>Subscription and credit balances (for billing).</li>
        </ul>
        <h2>Who can see your data</h2>
        <p>Only you. Row-level security guarantees no other user — and no Razen team member browsing the app — can see another user's chats. The only people with administrative database access are the founders.</p>
        <h2>Model providers</h2>
        <p>When you send a message, the prompt and any attached image are forwarded to the selected model provider (Anthropic for Claude, Google for Gemini via the Lovable AI gateway). Neither uses your prompts to train their models under our enterprise terms.</p>
        <h2>Delete your data</h2>
        <p>You can wipe your chats, memory and account at any time from <a href="/settings/danger">Settings → Danger zone</a>.</p>
        <h2>Contact</h2>
        <p>privacy@razen.app</p>
      </article>
    </div>
  );
}

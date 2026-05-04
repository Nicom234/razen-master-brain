import { jsonOk } from "../_shared/oauth.ts";
// Standard Slack bot tokens do not expire — no refresh needed.
Deno.serve(() => jsonOk({ ok: true, note: "Slack tokens do not expire" }));

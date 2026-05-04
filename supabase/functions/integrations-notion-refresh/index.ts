import { jsonOk } from "../_shared/oauth.ts";
// Notion access tokens do not expire — no refresh needed.
Deno.serve(() => jsonOk({ ok: true, note: "Notion tokens do not expire" }));

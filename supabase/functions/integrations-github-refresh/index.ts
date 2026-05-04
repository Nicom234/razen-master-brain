import { jsonOk } from "../_shared/oauth.ts";
// GitHub OAuth tokens do not expire — no refresh needed.
Deno.serve(() => jsonOk({ ok: true, note: "GitHub tokens do not expire" }));

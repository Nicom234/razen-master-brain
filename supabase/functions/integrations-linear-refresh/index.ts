import { jsonOk } from "../_shared/oauth.ts";
// Linear access tokens do not expire — no refresh needed.
Deno.serve(() => jsonOk({ ok: true, note: "Linear tokens do not expire" }));

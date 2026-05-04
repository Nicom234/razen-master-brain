// Nango proxy helper for backend/agents/tools
// All provider API calls route through https://api.nango.dev/proxy so Nango
// handles token refresh, retries, and multi-provider normalisation.

export interface NangoProxyOpts {
  method?: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  extraHeaders?: Record<string, string>;
}

const NANGO_API = "https://api.nango.dev";

export async function nangoProxy(
  providerKey: string,
  connectionId: string,
  path: string,
  opts: NangoProxyOpts = {},
): Promise<Response> {
  const key = Deno.env.get("NANGO_SECRET_KEY");
  if (!key) throw new Error("NANGO_SECRET_KEY not set");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Connection-Id": connectionId,
    "Provider-Config-Key": providerKey,
    "Content-Type": opts.contentType ?? "application/json",
    ...(opts.extraHeaders ?? {}),
  };
  const body = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  return fetch(`${NANGO_API}/proxy${path}`, { method: opts.method ?? "GET", headers, body });
}

export async function nangoJSON<T = unknown>(
  providerKey: string,
  connectionId: string,
  path: string,
  opts?: NangoProxyOpts,
): Promise<T> {
  const res = await nangoProxy(providerKey, connectionId, path, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[${providerKey}] ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export function notConnected(provider: string): { error: string } {
  return { error: `${provider} is not connected — connect it from Workspace settings.` };
}

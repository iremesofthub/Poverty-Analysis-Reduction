const API_BASE = import.meta.env.VITE_IREME_API_URL?.replace(/\/$/, "");

export async function requestGoverned(path, { method = "GET", body, idempotencyKey, responseType = "json" } = {}) {
  if (!API_BASE) {
    throw new Error("The governed Ireme API is not configured. Set VITE_IREME_API_URL to the deployed API address.");
  }

  // In HACKATHON_DEMO mode the governed API creates a demo principal for unauthenticated requests,
  // so a bearer token is optional. When Supabase is configured and a session exists, forward its token.
  let token = null;
  try {
    const { data, error } = await (globalThis.supabase?.auth.getSession?.() || Promise.resolve({ data: {}, error: null }));
    if (!error && data.session?.access_token) {
      token = data.session.access_token;
    }
  } catch {
    // Supabase not available or no session — proceed without a token (demo mode)
  }

  const headers = new Headers({ Accept: responseType === "blob" ? "application/octet-stream" : "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (cause) {
    // Tagged as unreachable so the workspace can say "the check did not run" instead of the reader
    // mistaking an outage for a figure that failed verification.
    throw Object.assign(new Error("Could not reach the governed Ireme API. Check its address and that the service is running.", { cause }), {
      kind: "unreachable",
      status: 0,
    });
  }

  if (!response.ok) {
    let detail;
    try { detail = await response.json(); } catch { detail = null; }
    const code = detail?.error_code ? ` (${detail.error_code})` : "";
    const trace = detail?.trace_id ? ` Trace ID: ${detail.trace_id}.` : "";
    throw Object.assign(new Error(`${detail?.message || `Request failed (${response.status})`}${code}.${trace}`), {
      status: response.status,
      code: detail?.error_code,
      traceId: detail?.trace_id,
    });
  }
  if (responseType === "blob") return { blob: await response.blob(), contentType: response.headers.get("Content-Type") };
  return response.json();
}
